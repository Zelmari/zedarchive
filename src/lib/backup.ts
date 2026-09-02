import { XMLParser } from 'fast-xml-parser';
import type { MediaCycle } from '@/types/media';

export interface ImportDraft {
  title: string;
  category?: string;
  status?: string;
  dropReason?: string | null;
  droppedAt?: string | null;
  droppedProgressPrimary?: number | null;
  droppedProgressSecondary?: number | null;
  cycles?: MediaCycle[];
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

export function mapListStatus(status: unknown): string {
  const s = String(status ?? '')
    .toLowerCase()
    .trim();
  if (s === '1' || s === 'watching' || s === 'in_progress' || s === 'repeating')
    return 'in_progress';
  if (s === '2' || s === 'completed') return 'completed';
  if (
    s === '3' ||
    s === 'on_hold' ||
    s === 'on-hold' ||
    s === 'onhold' ||
    s === 'hold' ||
    s === 'paused'
  )
    return 'on_hold';
  if (s === '4' || s === 'dropped') return 'dropped';
  if (
    s === '6' ||
    s === 'plan_to_watch' ||
    s === 'plantowatch' ||
    s === 'plan-to-watch' ||
    s === 'planning' ||
    s === 'plantosee' ||
    s === 'plan_to_see'
  )
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
      status: mapListStatus(a.my_status),
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
        status: mapListStatus(item.status),
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
  const h = header.toLowerCase();
  return h.includes('book id') || h.includes('title');
}

function parseGoodreadsCsv(text: string): ImportDraft[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) throw new Error('CSV file is empty');

  const headerLine = lines[0] ?? '';
  if (!looksLikeGoodreadsHeader(headerLine)) return [];

  const headers = parseCsvCells(headerLine).map((header) => header.toLowerCase());
  const titleIdx = headers.indexOf('title');
  if (titleIdx === -1) return [];

  const items: ImportDraft[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvCells(lines[i] ?? '');
    const cleanTitle = cols[titleIdx]?.trim();
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
  return items;
}

export function looksLikeLetterboxdHeader(header: string): boolean {
  const h = header.toLowerCase();
  return (
    h.includes('letterboxd uri') ||
    (h.includes('name') &&
      h.includes('year') &&
      (h.includes('watched date') ||
        h.includes('rating') ||
        h.includes('rewatch') ||
        h.includes('date')))
  );
}

function parseCsvCells(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

export function parseLetterboxdCsv(text: string, fileName?: string): ImportDraft[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const headerLine = lines[0] ?? '';
  if (!looksLikeLetterboxdHeader(headerLine)) return [];

  const headers = parseCsvCells(headerLine).map((h) => h.toLowerCase());
  const nameIdx = headers.indexOf('name');
  if (nameIdx === -1) return [];

  const ratingIdx = headers.indexOf('rating');
  const rewatchIdx = headers.indexOf('rewatch');
  const reviewIdx = headers.indexOf('review');
  const tagsIdx = headers.indexOf('tags');
  const isWatchlist =
    Boolean(fileName && fileName.toLowerCase().includes('watchlist')) ||
    headerLine.toLowerCase().includes('watchlist');

  const items: ImportDraft[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = parseCsvCells(line);
    const rawTitle = cols[nameIdx]?.replace(/^"|"$/g, '').trim();
    if (!rawTitle) continue;

    let rating: number | null = null;
    if (ratingIdx !== -1 && cols[ratingIdx]) {
      const rawRating = parseFloat(cols[ratingIdx]);
      if (!isNaN(rawRating) && rawRating > 0) {
        rating = Math.min(10, Math.max(1, Math.round(rawRating * 2)));
      }
    }

    const isRewatch =
      rewatchIdx !== -1 &&
      (cols[rewatchIdx]?.toLowerCase() === 'yes' || cols[rewatchIdx]?.toLowerCase() === 'true');

    const review =
      reviewIdx !== -1 && cols[reviewIdx] ? cols[reviewIdx].replace(/^"|"$/g, '').trim() : null;

    const tags =
      tagsIdx !== -1 && cols[tagsIdx]
        ? cols[tagsIdx]
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    items.push({
      title: rawTitle,
      category: 'movie',
      status: isWatchlist ? 'planning' : 'completed',
      primaryUnitCurrent: isRewatch ? 2 : 1,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: null,
      rating,
      notes: review || null,
      tags: tags.length > 0 ? tags : undefined,
    });
  }

  return items;
}

/**
 * Parse an uploaded backup/import file into media-entry drafts.
 *
 * Supported formats: ZedArchive JSON backups (plain arrays), AniList list
 * exports, Goodreads CSV exports, Letterboxd CSV exports, and Simkl JSON exports.
 *
 * @throws {Error} With a user-facing message when nothing can be parsed.
 */
export function parseSimklJson(json: unknown): ImportDraft[] | null {
  if (!json || typeof json !== 'object') return null;

  const data = json as Record<string, unknown>;
  const hasSimklKeys = 'shows' in data || 'anime' in data || 'movies' in data;
  if (!hasSimklKeys) return null;

  const items: ImportDraft[] = [];

  const categories: Array<{ key: string; defaultCategory: 'show' | 'anime' | 'movie' }> = [
    { key: 'shows', defaultCategory: 'show' },
    { key: 'anime', defaultCategory: 'anime' },
    { key: 'movies', defaultCategory: 'movie' },
  ];

  for (const { key, defaultCategory } of categories) {
    const list = data[key];
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;

      const mediaObj = ((entry.show ?? entry.anime ?? entry.movie ?? entry) || {}) as Record<
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
        status: mapListStatus(entry.status),
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
    const letterboxdItems = parseLetterboxdCsv(text, fileName);
    if (letterboxdItems.length > 0) {
      items = letterboxdItems;
    } else {
      items = parseGoodreadsCsv(text);
    }
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
