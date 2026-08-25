const ANILIST_LIST_PATH = 'data.MediaListCollection.lists';

function parseAniListList(json) {
  const lists = json?.data?.MediaListCollection?.lists;
  if (!Array.isArray(lists)) return null;
  const items = [];
  lists.forEach((list) => {
    (list.entries || []).forEach((item) => {
      items.push({
        title: item.media?.title?.english || item.media?.title?.romaji || 'Untitled',
        category: item.media?.type === 'MANGA' ? 'manga' : 'anime',
        status: item.status === 'COMPLETED' ? 'completed' : 'in_progress',
        secondaryUnitCurrent: item.progress || 0,
        secondaryUnitTotal: item.media?.episodes || item.media?.chapters || null,
        coverImage: item.media?.coverImage?.large || null,
        notes: item.notes || null,
        rating: item.score ? Math.round(item.score / 10) : null,
      });
    });
  });
  return items;
}

function looksLikeGoodreadsHeader(header) {
  return header.includes('book id') || header.includes('title');
}

function parseGoodreadsCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) throw new Error('CSV file is empty');

  const header = lines[0].toLowerCase();
  if (!looksLikeGoodreadsHeader(header)) return [];

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
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
 * @param {string} fileName
 * @param {string} text Raw file contents.
 * @returns {Array<object>} Parsed entry drafts (at least one).
 * @throws {Error} With a user-facing message when nothing can be parsed.
 */
export function parseImportFile(fileName, text) {
  let items = [];

  if (fileName.endsWith('.json')) {
    const json = JSON.parse(text);
    if (Array.isArray(json)) {
      items = json;
    } else {
      const aniListItems = parseAniListList(json);
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
