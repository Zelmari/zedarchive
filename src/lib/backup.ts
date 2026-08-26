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
  [key: string]: unknown;
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
        throw new Error('Unrecognized JSON format. Please upload a ZedArchive backup or supported export.');
      }
      items = aniListItems;
    }
  } else if (fileName.endsWith('.csv')) {
    items = parseGoodreadsCsv(text);
  }

  if (items.length === 0) {
    throw new Error('No valid entries could be parsed from the file.');
  }
  return items;
}
