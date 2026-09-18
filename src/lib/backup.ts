import { XMLParser } from 'fast-xml-parser';
import type { MediaCycle } from '@/types/media';
import { MAX_GUNZIP_BYTES, MAX_IMPORT_FILE_BYTES } from '@/lib/constants';

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
      manga?: Record<string, unknown> | Array<Record<string, unknown>>;
    };
  };

  const items: ImportDraft[] = [];
  const rawAnime = parsed?.myanimelist?.anime;
  const animeList = rawAnime ? (Array.isArray(rawAnime) ? rawAnime : [rawAnime]) : [];
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

  const rawManga = parsed?.myanimelist?.manga;
  const mangaList = rawManga ? (Array.isArray(rawManga) ? rawManga : [rawManga]) : [];
  for (const m of mangaList) {
    if (!m || typeof m !== 'object') continue;
    const title = String(m.manga_title ?? m.series_title ?? m.title ?? '').trim();
    if (!title) continue;

    const totalCh = Number(m.series_chapters) || null;
    const readCh = Number(m.my_read_chapters) || 0;
    const totalVol = Number(m.series_volumes) || null;
    const readVol = Number(m.my_read_volumes) || 0;
    const score = Number(m.my_score);
    const rating = !isNaN(score) && score > 0 ? Math.min(10, Math.max(1, Math.round(score))) : null;
    const comments = m.my_comments ? String(m.my_comments).trim() : null;

    items.push({
      title,
      category: 'manga',
      status: mapListStatus(m.my_status),
      secondaryUnitCurrent: readCh,
      secondaryUnitTotal: totalCh && totalCh > 0 ? totalCh : null,
      primaryUnitCurrent: readVol > 0 ? readVol : 1,
      primaryUnitTotal: totalVol && totalVol > 0 ? totalVol : 1,
      rating,
      notes: comments || null,
      sourceId: m.manga_mangadb_id ? `mal-manga-${m.manga_mangadb_id}` : null,
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
  return (
    h.includes('book id') ||
    h.includes('exclusive shelf') ||
    h.includes('isbn') ||
    h.includes('my rating')
  );
}

function looksLikeZedArchiveCsvHeader(header: string): boolean {
  const h = header.toLowerCase();
  return (
    h.includes('title') &&
    h.includes('category') &&
    h.includes('status') &&
    (h.includes('current primary unit') || h.includes('current secondary unit'))
  );
}

function headerIndex(headers: string[], name: string): number {
  return headers.indexOf(name.toLowerCase());
}

function csvCell(cols: string[], index: number): string {
  return index >= 0 ? (cols[index] ?? '').replace(/^"|"$/g, '').trim() : '';
}

function parseOptionalNumber(value: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseZedArchiveCsv(text: string): ImportDraft[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const headerLine = lines[0] ?? '';
  if (!looksLikeZedArchiveCsvHeader(headerLine)) return [];

  const headers = parseCsvCells(headerLine).map((header) => header.toLowerCase());
  const titleIdx = headerIndex(headers, 'title');
  if (titleIdx === -1) return [];

  const categoryIdx = headerIndex(headers, 'category');
  const statusIdx = headerIndex(headers, 'status');
  const dropReasonIdx = headerIndex(headers, 'drop reason');
  const droppedAtIdx = headerIndex(headers, 'dropped at');
  const ratingIdx = headerIndex(headers, 'rating');
  const primaryCurrentIdx = headerIndex(headers, 'current primary unit');
  const primaryTotalIdx = headerIndex(headers, 'total primary units');
  const secondaryCurrentIdx = headerIndex(headers, 'current secondary unit');
  const secondaryTotalIdx = headerIndex(headers, 'total secondary units');
  const notesIdx = headerIndex(headers, 'notes');
  const createdAtIdx = headerIndex(headers, 'created at');
  const completedAtIdx = headerIndex(headers, 'completed at');

  const items: ImportDraft[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvCells(lines[i] ?? '');
    const title = csvCell(cols, titleIdx);
    if (!title) continue;

    const rating = parseOptionalNumber(csvCell(cols, ratingIdx));
    items.push({
      title,
      category: csvCell(cols, categoryIdx) || 'show',
      status: csvCell(cols, statusIdx) || 'in_progress',
      dropReason: csvCell(cols, dropReasonIdx) || null,
      droppedAt: csvCell(cols, droppedAtIdx) || null,
      rating: rating && rating > 0 ? Math.min(10, Math.max(1, Math.round(rating))) : null,
      primaryUnitCurrent: parseOptionalNumber(csvCell(cols, primaryCurrentIdx)) ?? undefined,
      primaryUnitTotal: parseOptionalNumber(csvCell(cols, primaryTotalIdx)),
      secondaryUnitCurrent: parseOptionalNumber(csvCell(cols, secondaryCurrentIdx)) ?? undefined,
      secondaryUnitTotal: parseOptionalNumber(csvCell(cols, secondaryTotalIdx)),
      notes: csvCell(cols, notesIdx) || null,
      createdAt: csvCell(cols, createdAtIdx) || null,
      completedAt: csvCell(cols, completedAtIdx) || null,
    });
  }
  return items;
}

function mapGoodreadsShelf(shelf: string): string {
  const s = shelf.toLowerCase().trim();
  if (s === 'read') return 'completed';
  if (s === 'currently-reading' || s === 'currently reading') return 'in_progress';
  if (s === 'to-read' || s === 'to read') return 'planning';
  return mapListStatus(s);
}

function parseGoodreadsCsv(text: string): ImportDraft[] {
  const rows = parseCsvRows(text);
  if (rows.length <= 1) throw new Error('CSV file is empty');

  const headerLine = (rows[0] ?? []).join(',');
  if (!looksLikeGoodreadsHeader(headerLine)) return [];

  const headers = (rows[0] ?? []).map((header) => header.toLowerCase());
  const titleIdx = headers.indexOf('title');
  if (titleIdx === -1) return [];
  const authorIdx = headers.findIndex((h) => h === 'author' || h === 'author l-f');
  const ratingIdx = headers.indexOf('my rating');
  const shelfIdx = headers.indexOf('exclusive shelf');

  const items: ImportDraft[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i] ?? [];
    const cleanTitle = cols[titleIdx]?.replace(/^"|"$/g, '').trim();
    if (!cleanTitle) continue;
    const author = authorIdx >= 0 ? cols[authorIdx]?.replace(/^"|"$/g, '').trim() : '';
    const rawRating = ratingIdx >= 0 ? parseFloat(cols[ratingIdx] ?? '') : NaN;
    const rating =
      !isNaN(rawRating) && rawRating > 0
        ? Math.min(10, Math.max(1, Math.round(rawRating <= 5 ? rawRating * 2 : rawRating)))
        : null;
    const shelf = shelfIdx >= 0 ? (cols[shelfIdx] ?? '') : '';
    items.push({
      title: cleanTitle,
      category: 'book',
      status: mapGoodreadsShelf(shelf),
      rating,
      notes: author ? `Author: ${author}` : null,
      primaryUnitCurrent: 1,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: null,
    });
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

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function parseCsvCells(line: string): string[] {
  return parseCsvRows(line)[0] ?? [];
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
      rewatchCount: isRewatch ? 1 : 0,
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
    const zedArchiveItems = parseZedArchiveCsv(text);
    if (zedArchiveItems.length > 0) {
      items = zedArchiveItems;
    } else {
      const letterboxdItems = parseLetterboxdCsv(text, fileName);
      if (letterboxdItems.length > 0) {
        items = letterboxdItems;
      } else {
        items = parseGoodreadsCsv(text);
      }
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
export async function decompressGzip(
  buffer: ArrayBuffer | Uint8Array,
  maxBytes = MAX_GUNZIP_BYTES,
): Promise<string> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
      controller.close();
    },
  });
  const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
  const reader = decompressedStream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Decompressed file is too large');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

/**
 * Parse an import file from raw ArrayBuffer, automatically decompressing .gz payloads.
 */
export async function parseImportBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): Promise<ImportDraft[]> {
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Import file is too large');
  }
  if (fileName.endsWith('.gz') || isGzip(buffer)) {
    const decompressed = await decompressGzip(buffer);
    const resolvedName = fileName.replace(/\.gz$/i, '');
    return parseImportFile(resolvedName, decompressed);
  }

  const text = new TextDecoder('utf-8').decode(buffer);
  return parseImportFile(fileName, text);
}
