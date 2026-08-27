import { XMLParser } from 'fast-xml-parser';

export interface ImportDraft {
  title: string;
  category?: string;
  status?: string;
  secondaryUnitCurrent?: number;
  secondaryUnitTotal?: number | null;
  primaryUnitCurrent?: number;
  primaryUnitTotal?: number | null;
  coverImage?: string | null;
  notes?: string | null;
  rating?: number | null;
  sourceId?: string | null;
  [key: string]: unknown;
}

export function mapMalStatus(status: unknown): string {
  const s = String(status ?? '')
    .toLowerCase()
    .trim();
  if (s === '1' || s === 'watching') return 'in_progress';
  if (s === '2' || s === 'completed') return 'completed';
  if (s === '3' || s === 'on_hold' || s === 'on-hold' || s === 'onhold') return 'on_hold';
  if (s === '4' || s === 'dropped') return 'dropped';
  if (s === '6' || s === 'plan_to_watch' || s === 'plantowatch' || s === 'plan-to-watch')
    return 'planning';
  return 'in_progress';
}

export function parseMalXml(xmlText: string): ImportDraft[] {
  const parser = new XMLParser({
    trimValues: true,
  });
  const parsed = parser.parse(xmlText) as {
    myanimelist?: {
      anime?: Record<string, unknown> | Array<Record<string, unknown>>;
    };
  };

  const rawAnime = parsed?.myanimelist?.anime;
  if (!rawAnime) return [];

  const animeList = Array.isArray(rawAnime) ? rawAnime : [rawAnime];
  const items: ImportDraft[] = [];

  for (const a of animeList) {
    if (!a || typeof a !== 'object') continue;
    const title = String(a.series_title ?? a.title ?? '').trim();
    if (!title) continue;

    const totalEp = Number(a.series_episodes) || null;
    const watchedEp = Number(a.my_watched_episodes) || 0;
    const score = Number(a.my_score);
    const rating = !isNaN(score) && score > 0 ? Math.min(10, Math.max(1, Math.round(score))) : null;
    const comments = a.my_comments ? String(a.my_comments).trim() : null;

    items.push({
      title,
      category: 'anime',
      status: mapMalStatus(a.my_status),
      secondaryUnitCurrent: watchedEp,
      secondaryUnitTotal: totalEp && totalEp > 0 ? totalEp : null,
      primaryUnitCurrent: 1,
      primaryUnitTotal: 1,
      rating,
      notes: comments || null,
      sourceId: a.series_animedb_id ? `mal-${a.series_animedb_id}` : null,
    });
  }

  return items;
}

const ANILIST_LIST_PATH = 'data.MediaListCollection.lists';

interface AniListNode {
  data?: {
    MediaListCollection?: {
      lists?: Array<{
        entries?: Array<{
          status?: string;
          progress?: number;
          score?: number;
          notes?: string | null;
          media?: {
            id?: number;
            type?: string;
            episodes?: number | null;
            chapters?: number | null;
            title?: { english?: string | null; romaji?: string | null };
            coverImage?: { large?: string | null };
          } | null;
        }>;
      }>;
    };
  };
}

function parseAniListList(json: AniListNode): ImportDraft[] | null {
  const lists = json?.data?.MediaListCollection?.lists;
  if (!Array.isArray(lists)) return null;
  const items: ImportDraft[] = [];
  lists.forEach((list) => {
    if (!list || typeof list !== 'object') return;
    (list.entries || []).forEach((item) => {
      if (!item || typeof item !== 'object') return;
      items.push({
        title: item.media?.title?.english || item.media?.title?.romaji || 'Untitled',
        category: item.media?.type === 'MANGA' ? 'manga' : 'anime',
        status: item.status === 'COMPLETED' ? 'completed' : 'in_progress',
        secondaryUnitCurrent: item.progress || 0,
        secondaryUnitTotal: item.media?.episodes ?? item.media?.chapters ?? null,
        coverImage: item.media?.coverImage?.large || null,
        notes: item.notes || null,
        rating: item.score ? Math.round(item.score / 10) : null,
        sourceId: item.media?.id ? `anilist-${item.media.id}` : null,
      });
    });
  });
  return items;
}

function looksLikeGoodreadsHeader(header: string): boolean {
  return header.includes('book id') || header.includes('title');
}

function parseGoodreadsCsv(text: string): ImportDraft[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) throw new Error('CSV file is empty');

  const header = lines[0]?.toLowerCase() ?? '';
  if (!looksLikeGoodreadsHeader(header)) return [];

  const items: ImportDraft[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? '').split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (cols.length >= 2) {
      const cleanTitle = cols[1]?.replace(/^"|"$/g, '').trim();
      if (cleanTitle) {
        items.push({
          title: cleanTitle,
          category: 'book',
          status: 'in_progress',
          primaryUnitCurrent: 1,
          primaryUnitTotal: 1,
          secondaryUnitCurrent: 0,
          secondaryUnitTotal: null,
        });
      }
    }
  }
  return items;
}

/**
 * Parse an uploaded backup/import file into media-entry drafts.
 *
 * Supported formats: ZedArchive JSON backups (plain arrays), AniList list
 * exports, and Goodreads CSV exports.
 *
 * @throws {Error} With a user-facing message when nothing can be parsed.
 */
export function mapSimklStatus(status: unknown): string {
  const s = String(status ?? '')
    .toLowerCase()
    .trim();
  if (s === 'watching' || s === 'in_progress') return 'in_progress';
  if (s === 'completed') return 'completed';
  if (s === 'hold' || s === 'on_hold' || s === 'on-hold') return 'on_hold';
  if (s === 'dropped') return 'dropped';
  if (s === 'plantowatch' || s === 'plan_to_watch' || s === 'plantosee' || s === 'plan_to_see')
    return 'planning';
  return 'in_progress';
}

export function parseSimklJson(json: unknown): ImportDraft[] | null {
  if (!json || typeof json !== 'object') return null;

  const data = json as Record<string, unknown>;
  const hasSimklKeys = 'shows' in data || 'anime' in data || 'movies' in data;
  if (!hasSimklKeys) return null;

  const items: ImportDraft[] = [];

  const categories: Array<{ key: string; defaultCategory: 'show' | 'anime' }> = [
    { key: 'shows', defaultCategory: 'show' },
    { key: 'anime', defaultCategory: 'anime' },
    { key: 'movies', defaultCategory: 'show' },
  ];

  for (const { key, defaultCategory } of categories) {
    const list = data[key];
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;

      const mediaObj = (entry.show ?? entry.anime ?? entry.movie ?? entry) as Record<
        string,
        unknown
      >;
      const title = String(mediaObj.title ?? entry.title ?? '').trim();
      if (!title) continue;

      const totalEp = Number(mediaObj.total_episodes ?? entry.total_episodes) || null;
      const watchedEp =
        Number(entry.watched_episodes_count ?? entry.watched_episodes ?? entry.progress) || 0;
      const rating = Number(entry.user_rating ?? entry.rating) || null;
      const simklId =
        (mediaObj.ids as Record<string, unknown> | undefined)?.simkl ?? entry.simkl_id;

      items.push({
        title,
        category: defaultCategory,
        status: mapSimklStatus(entry.status),
        secondaryUnitCurrent: watchedEp,
        secondaryUnitTotal: totalEp && totalEp > 0 ? totalEp : null,
        primaryUnitCurrent: 1,
        primaryUnitTotal: 1,
        rating: rating && rating > 0 ? Math.min(10, Math.max(1, Math.round(rating))) : null,
        notes: entry.notes ? String(entry.notes).trim() : null,
        sourceId: simklId ? `simkl-${simklId}` : null,
      });
    }
  }

  return items.length > 0 ? items : null;
}

export function parseImportFile(fileName: string, text: string): ImportDraft[] {
  let items: ImportDraft[] = [];

  if (fileName.endsWith('.json')) {
    const json = JSON.parse(text) as unknown;
    if (Array.isArray(json)) {
      // Defensive: skip nulls, primitives, and records without a usable
      // title instead of letting them abort the whole import downstream.
      items = (json as unknown[]).filter((item): item is ImportDraft =>
        Boolean(
          item &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).title === 'string' &&
          ((item as Record<string, unknown>).title as string).trim().length > 0,
        ),
      );
    } else {
      const aniListItems = parseAniListList(json as AniListNode);
      const simklItems = parseSimklJson(json);
      if (aniListItems) {
        items = aniListItems;
      } else if (simklItems) {
        items = simklItems;
      } else {
        throw new Error(
          'Unrecognized JSON format. Please upload a ZedArchive backup or supported export.',
        );
      }
    }
  } else if (fileName.endsWith('.csv')) {
    items = parseGoodreadsCsv(text);
  } else if (
    fileName.endsWith('.xml') ||
    text.trim().startsWith('<?xml') ||
    text.trim().startsWith('<myanimelist>')
  ) {
    items = parseMalXml(text);
  }

  if (items.length === 0) {
    throw new Error('No valid entries could be parsed from the file.');
  }
  return items;
}

/**
 * Check if a buffer begins with the gzip magic bytes (0x1f, 0x8b).
 */
export function isGzip(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Decompress a gzip ArrayBuffer or Uint8Array using web-standard DecompressionStream.
 */
export async function decompressGzip(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
      controller.close();
    },
  });
  const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
  const response = new Response(decompressedStream);
  return await response.text();
}

/**
 * Parse an import file from raw ArrayBuffer, automatically decompressing .gz payloads.
 */
export async function parseImportBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): Promise<ImportDraft[]> {
  if (fileName.endsWith('.gz') || isGzip(buffer)) {
    const decompressed = await decompressGzip(buffer);
    const resolvedName = fileName.replace(/\.gz$/i, '');
    return parseImportFile(resolvedName, decompressed);
  }

  const text = new TextDecoder('utf-8').decode(buffer);
  return parseImportFile(fileName, text);
}
