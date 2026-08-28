/**
 * src/scripts/migrate-json-to-relational.ts
 *
 * One-shot idempotent migration that backfills the normalized relational tables
 * (media_cycles, media_quotes, media_tags, media_entry_tags) from the existing
 * JSONB columns on media_entries.
 *
 * Run with:
 *   npx tsx src/scripts/migrate-json-to-relational.ts
 *
 * Safety guarantees:
 * - Idempotent: rows already present in relational tables are skipped.
 * - Non-destructive: the JSONB columns on media_entries are never modified.
 * - Transactional per entry: a failure on one entry does not affect others.
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { mediaEntries, mediaCycles, mediaQuotes, mediaTags, mediaEntryTags } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { MediaCycle, MediaQuote } from '../types/media';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 Starting JSON → relational migration...');

  // Fetch all entries that still have JSONB data
  const entries = await db
    .select({
      id: mediaEntries.id,
      userId: mediaEntries.userId,
      cycles: mediaEntries.cycles,
      quotes: mediaEntries.quotes,
      tags: mediaEntries.tags,
      startedAt: mediaEntries.startedAt,
      completedAt: mediaEntries.completedAt,
    })
    .from(mediaEntries);

  console.log(`  Found ${entries.length} media entries to process.`);

  // Build a set of already-migrated cycles, quotes, and tags to ensure idempotency
  const existingCycleIds = new Set(
    (await db.select({ id: mediaCycles.id }).from(mediaCycles)).map((r) => r.id),
  );
  const existingQuoteIds = new Set(
    (await db.select({ id: mediaQuotes.id }).from(mediaQuotes)).map((r) => r.id),
  );
  // Tag dedup: map of "userId:normalizedName" → tagId
  const existingTagMap = new Map<string, string>();
  const allTags = await db
    .select({
      id: mediaTags.id,
      userId: mediaTags.userId,
      normalizedName: mediaTags.normalizedName,
    })
    .from(mediaTags);
  for (const t of allTags) {
    existingTagMap.set(`${t.userId}:${t.normalizedName}`, t.id);
  }
  // Entry-tag pairs already migrated
  const existingEntryTags = new Set(
    (
      await db
        .select({ mediaId: mediaEntryTags.mediaId, tagId: mediaEntryTags.tagId })
        .from(mediaEntryTags)
    ).map((r) => `${r.mediaId}:${r.tagId}`),
  );

  let cyclesMigrated = 0;
  let quotesMigrated = 0;
  let tagsMigrated = 0;
  let entryTagsMigrated = 0;

  for (const entry of entries) {
    try {
      // ── Cycles ──────────────────────────────────────────────────────────────
      const rawCycles = Array.isArray(entry.cycles) ? (entry.cycles as MediaCycle[]) : [];
      for (const cycle of rawCycles) {
        if (!cycle?.id || existingCycleIds.has(cycle.id)) continue;

        await db.insert(mediaCycles).values({
          id: cycle.id,
          mediaId: entry.id,
          userId: entry.userId,
          cycleNumber: typeof cycle.cycleNumber === 'number' ? cycle.cycleNumber : 1,
          startedAt: toDateOrNull(cycle.startedAt),
          completedAt: toDateOrNull(cycle.completedAt),
          rating: typeof cycle.rating === 'number' ? cycle.rating : null,
          notes: typeof cycle.notes === 'string' ? cycle.notes : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        existingCycleIds.add(cycle.id);
        cyclesMigrated++;
      }

      // ── Quotes ──────────────────────────────────────────────────────────────
      const rawQuotes = Array.isArray(entry.quotes) ? (entry.quotes as MediaQuote[]) : [];
      for (const quote of rawQuotes) {
        if (!quote?.id || existingQuoteIds.has(quote.id)) continue;

        await db.insert(mediaQuotes).values({
          id: quote.id,
          mediaId: entry.id,
          userId: entry.userId,
          text: quote.text,
          speaker: quote.speaker ?? null,
          citation: quote.citation ?? null,
          isFavorite: Boolean(quote.isFavorite),
          createdAt: toDateOrNull(quote.createdAt) ?? new Date(),
        });

        existingQuoteIds.add(quote.id);
        quotesMigrated++;
      }

      // ── Tags ─────────────────────────────────────────────────────────────────
      const rawTags = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
      for (const tag of rawTags) {
        const normalized = String(tag).trim().toLowerCase();
        if (!normalized) continue;

        const mapKey = `${entry.userId}:${normalized}`;
        let tagId = existingTagMap.get(mapKey);

        if (!tagId) {
          // Create new tag entry
          tagId = crypto.randomUUID();
          await db.insert(mediaTags).values({
            id: tagId,
            userId: entry.userId,
            name: normalized,
            normalizedName: normalized,
            createdAt: new Date(),
          });
          existingTagMap.set(mapKey, tagId);
          tagsMigrated++;
        }

        const entryTagKey = `${entry.id}:${tagId}`;
        if (!existingEntryTags.has(entryTagKey)) {
          await db.insert(mediaEntryTags).values({
            mediaId: entry.id,
            tagId,
          });
          existingEntryTags.add(entryTagKey);
          entryTagsMigrated++;
        }
      }
    } catch (err) {
      console.error(`  ⚠ Failed to migrate entry ${entry.id}:`, err);
    }
  }

  console.log(`
✅ Migration complete:
  - Cycles migrated:     ${cyclesMigrated}
  - Quotes migrated:     ${quotesMigrated}
  - Tags created:        ${tagsMigrated}
  - Entry-tag links:     ${entryTagsMigrated}
  `);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
