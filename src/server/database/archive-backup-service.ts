import 'server-only'

import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { z } from '@/config/zod'
import {
  archiveBackupMaximumBytes,
  archiveBackupMaximumEntries,
  archiveBackupMaximumTitleBytes,
  parseArchiveBackupDocument,
  utf8ByteLength,
} from '@/features/archive-backup/domain/archive-backup'
import { establishActiveAccount } from '@/server/database/active-account-transaction'

export type ArchiveBackupResult =
  | Readonly<{
      kind: 'backup_ready'
      bytes: Uint8Array
      filename: 'zedarchive-archive-backup-v1.json'
    }>
  | Readonly<{ kind: 'account_unavailable' }>
  | Readonly<{ kind: 'too_large' }>
  | Readonly<{ kind: 'data_unavailable' }>

const archiveBackupRequestSchema = z.strictObject({ userId: z.uuidv4() })

type ArchiveBackupDatabase = NodePgDatabase

/**
 * A deliberately narrow test seam for deterministic post-preflight races.
 * Production callers never provide it; it runs while the active-account lock
 * is held and before the single payload statement takes its snapshot.
 */
export type ArchiveBackupReadTestHooks = Readonly<{
  afterPreflight?: () => Promise<void>
  /**
   * Holds the one payload statement after PostgreSQL has taken its statement
   * snapshot. It exists only for the integration snapshot-race proof.
   */
  payloadStatementBarrierKey?: number
}>

/**
 * The SQL has deliberately duplicated bounds in preflight and payload. The
 * preflight sends only a boolean; the payload gets one statement snapshot and
 * never materializes a document when a concurrent change exceeds a bound.
 */
function backupBoundsSql(userId: string) {
  return sql<{ withinBounds: boolean }>`
    with owner_entries as materialized (
      select e.id, e.catalogue_item_id, e.created_at, e.status, e.episode_progress,
             e.episode_total_override, e.rating, e.is_favourite,
             e.start_date, e.finish_date,
             c.english_title, c.romaji_title, c.original_title,
             c.format, c.release_status, c.release_year, c.episode_count,
             c.maturity
        from anime_entries e
        join anime_catalogue_items c on c.id = e.catalogue_item_id
       where e.user_id = ${userId}::uuid
       order by e.created_at, e.id
       limit ${archiveBackupMaximumEntries + 1}
    ), alternative_metrics as (
      select a.catalogue_item_id, count(*)::int as alternative_count,
             bool_and(octet_length(a.title) <= ${archiveBackupMaximumTitleBytes}) as titles_fit,
             2 + coalesce(sum(octet_length(to_json(a.title)::text)), 0) + greatest(count(*) - 1, 0) as json_bytes
        from anime_alternative_titles a
       where a.catalogue_item_id in (select catalogue_item_id from owner_entries)
       group by a.catalogue_item_id
    ), measured_entries as (
      select e.*, coalesce(a.alternative_count, 0) as alternative_count,
             coalesce(a.titles_fit, true) as titles_fit,
             coalesce(a.json_bytes, 2) as alternatives_bytes,
             octet_length('{"catalogue":{"titles":{"english":') + octet_length(coalesce(to_json(e.english_title)::text, 'null')) +
             octet_length(',"romaji":') + octet_length(coalesce(to_json(e.romaji_title)::text, 'null')) +
             octet_length(',"original":') + octet_length(coalesce(to_json(e.original_title)::text, 'null')) +
             octet_length(',"alternatives":') + coalesce(a.json_bytes, 2) +
             octet_length('},"format":') + octet_length(to_json(e.format)::text) +
             octet_length(',"releaseStatus":') + octet_length(to_json(e.release_status)::text) +
             octet_length(',"releaseYear":') + octet_length(coalesce(to_json(e.release_year)::text, 'null')) +
             octet_length(',"episodeCount":') + octet_length(coalesce(to_json(e.episode_count)::text, 'null')) +
             octet_length(',"maturity":') + octet_length(to_json(e.maturity)::text) +
             octet_length('},"tracking":{"status":') + octet_length(to_json(e.status)::text) +
             octet_length(',"episodeProgress":') + octet_length(to_json(e.episode_progress)::text) +
             octet_length(',"episodeTotalOverride":') + octet_length(coalesce(to_json(e.episode_total_override)::text, 'null')) +
             octet_length(',"rating":') + octet_length(coalesce(to_json(e.rating)::text, 'null')) +
             octet_length(',"isFavourite":') + octet_length(to_json(e.is_favourite)::text) +
             octet_length(',"startDate":') + octet_length(coalesce(to_json(e.start_date)::text, 'null')) +
             octet_length(',"finishDate":') + octet_length(coalesce(to_json(e.finish_date)::text, 'null')) +
             octet_length('}}') as entry_bytes
        from owner_entries e left join alternative_metrics a on a.catalogue_item_id = e.catalogue_item_id
    ), totals as (
      select count(*)::int as entry_count, coalesce(sum(entry_bytes), 0) + greatest(count(*) - 1, 0) as entries_bytes,
             coalesce(bool_and(
               (english_title is null or octet_length(english_title) <= ${archiveBackupMaximumTitleBytes}) and
               (romaji_title is null or octet_length(romaji_title) <= ${archiveBackupMaximumTitleBytes}) and
               (original_title is null or octet_length(original_title) <= ${archiveBackupMaximumTitleBytes}) and
               alternative_count <= 100 and titles_fit
             ), true) as fields_fit
        from measured_entries
    )
    select (current_setting('server_encoding') = 'UTF8' and t.entry_count <= ${archiveBackupMaximumEntries} and t.fields_fit and
      octet_length('{"schema":"zedarchive.archive-backup","version":1,"exportedAt":"0000-00-00T00:00:00.000Z","settings":{"anime":{"titleLanguage":') +
      octet_length(to_json(coalesce(p.title_language, 'english'))::text) +
      octet_length(',"adultContentEnabled":') + octet_length(to_json(coalesce(p.adult_content_enabled, false))::text) +
      octet_length('}},"archive":{"anime":{"entries":[') + t.entries_bytes + octet_length(']}}}') <= ${archiveBackupMaximumBytes}
    ) as "withinBounds"
      from totals t left join user_catalogue_preferences p on p.user_id = ${userId}::uuid
  `
}

function archiveBackupPayloadSql(
  userId: string,
  payloadStatementBarrierKey?: number,
) {
  return sql<{ payload: string; byteLength: number }>`
    with payload_statement_barrier as materialized (
      select case
        when ${payloadStatementBarrierKey ?? null}::bigint is null then 1
        else (
          select 1
            from (
              select pg_advisory_xact_lock(${payloadStatementBarrierKey ?? null}::bigint)
            ) as advisory_lock
        )
      end as barrier
    ), owner_entries as materialized (
      select e.id, e.catalogue_item_id, e.created_at, e.status,
             e.episode_progress, e.episode_total_override, e.rating,
             e.is_favourite, e.start_date, e.finish_date,
             c.english_title, c.romaji_title, c.original_title,
             c.format, c.release_status, c.release_year, c.episode_count,
             c.maturity
        from anime_entries e
        join anime_catalogue_items c on c.id = e.catalogue_item_id
       where e.user_id = ${userId}::uuid
       order by e.created_at, e.id
       limit ${archiveBackupMaximumEntries + 1}
    ), alternative_bounds as (
      select a.catalogue_item_id, count(*)::int as alternative_count,
             bool_and(octet_length(a.title) <= ${archiveBackupMaximumTitleBytes}) as titles_fit
        from anime_alternative_titles a
       where a.catalogue_item_id in (select catalogue_item_id from owner_entries)
       group by a.catalogue_item_id
    ), measured_entries as (
      select e.*, coalesce(a.alternative_count, 0) as alternative_count,
             coalesce(a.titles_fit, true) as titles_fit,
             coalesce(a.json_bytes, 2) as alternatives_bytes,
             octet_length('{"catalogue":{"titles":{"english":') + octet_length(coalesce(to_json(e.english_title)::text, 'null')) +
             octet_length(',"romaji":') + octet_length(coalesce(to_json(e.romaji_title)::text, 'null')) +
             octet_length(',"original":') + octet_length(coalesce(to_json(e.original_title)::text, 'null')) +
             octet_length(',"alternatives":') + coalesce(a.json_bytes, 2) +
             octet_length('},"format":') + octet_length(to_json(e.format)::text) +
             octet_length(',"releaseStatus":') + octet_length(to_json(e.release_status)::text) +
             octet_length(',"releaseYear":') + octet_length(coalesce(to_json(e.release_year)::text, 'null')) +
             octet_length(',"episodeCount":') + octet_length(coalesce(to_json(e.episode_count)::text, 'null')) +
             octet_length(',"maturity":') + octet_length(to_json(e.maturity)::text) +
             octet_length('},"tracking":{"status":') + octet_length(to_json(e.status)::text) +
             octet_length(',"episodeProgress":') + octet_length(to_json(e.episode_progress)::text) +
             octet_length(',"episodeTotalOverride":') + octet_length(coalesce(to_json(e.episode_total_override)::text, 'null')) +
             octet_length(',"rating":') + octet_length(coalesce(to_json(e.rating)::text, 'null')) +
             octet_length(',"isFavourite":') + octet_length(to_json(e.is_favourite)::text) +
             octet_length(',"startDate":') + octet_length(coalesce(to_json(e.start_date)::text, 'null')) +
             octet_length(',"finishDate":') + octet_length(coalesce(to_json(e.finish_date)::text, 'null')) + octet_length('}}') as entry_bytes
        from owner_entries e left join (
          select a.catalogue_item_id, count(*)::int as alternative_count,
                 bool_and(octet_length(a.title) <= ${archiveBackupMaximumTitleBytes}) as titles_fit,
                 2 + coalesce(sum(octet_length(to_json(a.title)::text)), 0) + greatest(count(*) - 1, 0) as json_bytes
            from anime_alternative_titles a
           where a.catalogue_item_id in (select catalogue_item_id from owner_entries)
           group by a.catalogue_item_id
        ) a on a.catalogue_item_id = e.catalogue_item_id
    ), totals as (
      select count(*)::int as entry_count,
             coalesce(sum(entry_bytes), 0) + greatest(count(*) - 1, 0) as entries_bytes,
             coalesce(bool_and(
               (english_title is null or octet_length(english_title) <= ${archiveBackupMaximumTitleBytes}) and
               (romaji_title is null or octet_length(romaji_title) <= ${archiveBackupMaximumTitleBytes}) and
               (original_title is null or octet_length(original_title) <= ${archiveBackupMaximumTitleBytes}) and
               alternative_count <= 100 and titles_fit
             ), true) as fields_fit
        from measured_entries
    ), bounds as (
      select current_setting('server_encoding') = 'UTF8' and t.entry_count <= ${archiveBackupMaximumEntries} and t.fields_fit and
        octet_length('{"schema":"zedarchive.archive-backup","version":1,"exportedAt":"0000-00-00T00:00:00.000Z","settings":{"anime":{"titleLanguage":') +
        octet_length(to_json(coalesce(p.title_language, 'english'))::text) +
        octet_length(',"adultContentEnabled":') + octet_length(to_json(coalesce(p.adult_content_enabled, false))::text) +
        octet_length('}},"archive":{"anime":{"entries":[') + t.entries_bytes + octet_length(']}}}') <= ${archiveBackupMaximumBytes} as valid
      from totals t left join user_catalogue_preferences p on p.user_id = ${userId}::uuid
    ), valid_source as materialized (
      select e.*
        from owner_entries e
        cross join payload_statement_barrier
        cross join bounds b
       where b.valid
    ), alternatives as (
      select a.catalogue_item_id,
             '[' || string_agg(to_json(a.title)::text, ',' order by a.position) || ']' as titles,
             count(*)::int as alternative_count,
             bool_and(octet_length(a.title) <= ${archiveBackupMaximumTitleBytes}) as titles_fit
        from anime_alternative_titles a
       where a.catalogue_item_id in (select catalogue_item_id from valid_source)
       group by a.catalogue_item_id
    ), guarded_entries as (
      select e.*, coalesce(a.titles, '[]') as alternatives,
             coalesce(a.alternative_count, 0) as alternative_count,
             coalesce(a.titles_fit, true) as alternative_titles_fit
        from valid_source e
        left join alternatives a on a.catalogue_item_id = e.catalogue_item_id
    ), entry_fragments as (
      select id, created_at,
             '{"catalogue":{"titles":{"english":' || coalesce(to_json(english_title)::text, 'null') ||
             ',"romaji":' || coalesce(to_json(romaji_title)::text, 'null') ||
             ',"original":' || coalesce(to_json(original_title)::text, 'null') ||
             ',"alternatives":' || alternatives ||
             '},"format":' || to_json(format)::text ||
             ',"releaseStatus":' || to_json(release_status)::text ||
             ',"releaseYear":' || coalesce(to_json(release_year)::text, 'null') ||
             ',"episodeCount":' || coalesce(to_json(episode_count)::text, 'null') ||
             ',"maturity":' || to_json(maturity)::text ||
             '},"tracking":{"status":' || to_json(status)::text ||
             ',"episodeProgress":' || to_json(episode_progress)::text ||
             ',"episodeTotalOverride":' || coalesce(to_json(episode_total_override)::text, 'null') ||
             ',"rating":' || coalesce(to_json(rating)::text, 'null') ||
             ',"isFavourite":' || to_json(is_favourite)::text ||
             ',"startDate":' || coalesce(to_json(start_date)::text, 'null') ||
             ',"finishDate":' || coalesce(to_json(finish_date)::text, 'null') || '}}' as entry_json
        from guarded_entries
    ), snapshot as (
      select clock_timestamp() at time zone 'utc' as exported_at,
             coalesce(p.title_language, 'english') as title_language,
             coalesce(p.adult_content_enabled, false) as adult_content_enabled,
             coalesce((select string_agg(entry_json, ',' order by created_at, id) from entry_fragments), '') as entries
        from (select 1) one
        left join user_catalogue_preferences p on p.user_id = ${userId}::uuid
    ), document as (
      select '{"schema":"zedarchive.archive-backup","version":1,"exportedAt":' ||
        to_json(to_char(exported_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text ||
        ',"settings":{"anime":{"titleLanguage":' || to_json(title_language)::text ||
        ',"adultContentEnabled":' || to_json(adult_content_enabled)::text ||
        '}},"archive":{"anime":{"entries":[' || entries || ']}}}' as payload
      from snapshot
      where (select valid from bounds)
    )
    select payload, octet_length(payload)::int as "byteLength"
      from document
     where octet_length(payload) <= ${archiveBackupMaximumBytes}
  `
}

export async function readArchiveBackup(
  database: ArchiveBackupDatabase,
  request: { userId: string },
  testHooks?: ArchiveBackupReadTestHooks,
): Promise<ArchiveBackupResult> {
  if (!archiveBackupRequestSchema.safeParse(request).success) {
    return { kind: 'account_unavailable' }
  }

  try {
    return await database.transaction(
      async (transaction) => {
        if (!(await establishActiveAccount(transaction, request.userId))) {
          return { kind: 'account_unavailable' }
        }

        const preflight = await transaction.execute(
          backupBoundsSql(request.userId),
        )
        if (preflight.rows[0]?.withinBounds !== true)
          return { kind: 'too_large' }

        await testHooks?.afterPreflight?.()

        const payload = await transaction.execute(
          archiveBackupPayloadSql(
            request.userId,
            testHooks?.payloadStatementBarrierKey,
          ),
        )
        const row = payload.rows[0]
        if (row === undefined) return { kind: 'too_large' }
        if (
          typeof row.payload !== 'string' ||
          typeof row.byteLength !== 'number'
        ) {
          return { kind: 'data_unavailable' }
        }
        if (
          row.byteLength > archiveBackupMaximumBytes ||
          utf8ByteLength(row.payload) > archiveBackupMaximumBytes
        ) {
          return { kind: 'too_large' }
        }

        try {
          parseArchiveBackupDocument(JSON.parse(row.payload))
        } catch {
          return { kind: 'data_unavailable' }
        }

        return {
          kind: 'backup_ready',
          bytes: new TextEncoder().encode(row.payload),
          filename: 'zedarchive-archive-backup-v1.json',
        }
      },
      { isolationLevel: 'read committed' },
    )
  } catch {
    return { kind: 'data_unavailable' }
  }
}
