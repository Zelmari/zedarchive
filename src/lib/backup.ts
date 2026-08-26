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
    (list.entries || []).forEach((item) => {
      items.push({
        title: item.media?.title?.english || item.media?.title?.romaji || 'Untitled',
        category: item.media?.type === 'MANGA' ? 'manga' : 'anime',
        status: item.status === 'COMPLETED' ? 'completed' : 'in_progress',
        secondaryUnitCurrent: item.progress || 0,
        secondaryUnitTotal: item.media?.episodes ?? item.media?.chapters ?? null,
        coverImage: item.media?.coverImage?.large || null,
        notes: item.notes || null,
        rating: item.score ? Math.round(item.score / 10) : null,
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
export function parseImportFile(fileName: string, text: string): ImportDraft[] {
  let items: ImportDraft[] = [];

  if (fileName.endsWith('.json')) {
    const json = JSON.parse(text) as unknown;
    if (Array.isArray(json)) {
      items = json as ImportDraft[];
    } else {
      const aniListItems = parseAniListList(json as AniListNode);
      if (!aniListItems) {
        throw new Error(
          'Unrecognized JSON format. Please upload a ZedArchive backup or supported export.',
        );
      }
      items = aniListItems;
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
