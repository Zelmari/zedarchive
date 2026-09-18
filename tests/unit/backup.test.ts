import { describe, it, expect } from 'vitest';
import { parseImportFile, parseImportBuffer, decompressGzip } from '@/lib/backup';

async function compressToGzip(str: string): Promise<ArrayBuffer> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(str));
      controller.close();
    },
  });
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const response = new Response(compressedStream);
  return await response.arrayBuffer();
}

describe('parseImportFile', () => {
  it('accepts a plain ZedArchive JSON array', () => {
    const items = parseImportFile('backup.json', JSON.stringify([{ title: 'Frieren' }]));
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Frieren');
  });

  it('parses AniList list exports', () => {
    const payload = {
      data: {
        MediaListCollection: {
          lists: [
            {
              entries: [
                {
                  progress: 7,
                  status: 'COMPLETED',
                  notes: 'great',
                  score: 90,
                  media: {
                    id: 30002,
                    type: 'MANGA',
                    episodes: null,
                    chapters: 120,
                    title: { english: 'Berserk', romaji: null },
                    coverImage: { large: 'https://example/c.jpg' },
                  },
                },
              ],
            },
          ],
        },
      },
    };
    const [item] = parseImportFile('anilist.json', JSON.stringify(payload));
    expect(item).toMatchObject({
      title: 'Berserk',
      category: 'manga',
      status: 'completed',
      secondaryUnitCurrent: 7,
      secondaryUnitTotal: 120,
      rating: 9,
      sourceId: 'anilist-30002',
    });
  });

  it('maps AniList list statuses to archive statuses', () => {
    const statuses = ['PLANNING', 'DROPPED', 'PAUSED', 'REPEATING'];
    const payload = {
      data: {
        MediaListCollection: {
          lists: [
            {
              entries: statuses.map((status, index) => ({
                status,
                media: {
                  id: index + 1,
                  type: 'ANIME',
                  title: { english: status },
                },
              })),
            },
          ],
        },
      },
    };

    const items = parseImportFile('anilist.json', JSON.stringify(payload));

    expect(items.map((item) => item.status)).toEqual([
      'planning',
      'dropped',
      'on_hold',
      'in_progress',
    ]);
  });

  it('rejects unrecognized JSON with a friendly message', () => {
    expect(() => parseImportFile('x.json', '{"hello":1}')).toThrow(
      'Unrecognized JSON format. Please upload a ZedArchive backup or supported export.',
    );
  });

  it('maps Goodreads exclusive shelves, ratings, and authors', () => {
    const csv = [
      'Book Id,Title,Author,ISBN,My Rating,Exclusive Shelf',
      '1,Atomic Habits,James Clear,123,4,read',
      '2,Dune,Frank Herbert,456,0,to-read',
      '3,Tomorrow and Tomorrow,Gabrielle Zevin,789,5,currently-reading',
    ].join('\n');
    const items = parseImportFile('goodreads.csv', csv);
    expect(items).toEqual([
      expect.objectContaining({
        title: 'Atomic Habits',
        status: 'completed',
        rating: 8,
        notes: 'Author: James Clear',
      }),
      expect.objectContaining({ title: 'Dune', status: 'planning', rating: null }),
      expect.objectContaining({
        title: 'Tomorrow and Tomorrow',
        status: 'in_progress',
        rating: 10,
      }),
    ]);
  });

  it('parses Goodreads-style CSV rows', () => {
    const csv = 'Book Id,Title,Author\n1,"Bell Hooks, All About Love",someone\n2,Atomic Habits,x\n';
    const items = parseImportFile('books.csv', csv);
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('Bell Hooks, All About Love');
    expect(items[0]?.category).toBe('book');
  });

  it('re-imports a ZedArchive CSV export without treating it as Goodreads', () => {
    const csv = [
      'Title,Category,Status,Drop Reason,Dropped At,Rating,Current Primary Unit,Total Primary Units,Current Secondary Unit,Total Secondary Units,Notes,Created At,Completed At',
      '"Severance",show,completed,"","",9,1,2,9,9,"Office horror","2026-01-01T00:00:00.000Z","2026-04-10T00:00:00.000Z"',
      '"Dune",book,in_progress,"","",,1,1,120,600,"","2026-02-01T00:00:00.000Z",',
    ].join('\n');

    const items = parseImportFile('zedarchive-export-2026-09-18.csv', csv);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Severance',
      category: 'show',
      status: 'completed',
      rating: 9,
      primaryUnitCurrent: 1,
      primaryUnitTotal: 2,
      secondaryUnitCurrent: 9,
      secondaryUnitTotal: 9,
      notes: 'Office horror',
    });
    expect(items[1]).toMatchObject({
      title: 'Dune',
      category: 'book',
      status: 'in_progress',
      secondaryUnitCurrent: 120,
      secondaryUnitTotal: 600,
    });
  });

  it('throws on an empty CSV', () => {
    expect(() => parseImportFile('empty.csv', 'Book Id,Title\n')).toThrow('CSV file is empty');
  });

  it('throws when a CSV has no recognizable header', () => {
    expect(() => parseImportFile('other.csv', 'Foo,Bar\n1,2\n')).toThrow(
      'No valid entries could be parsed from the file.',
    );
  });

  it('parses MyAnimeList XML export', () => {
    const malXml = `<?xml version="1.0" encoding="UTF-8" ?>
      <myanimelist>
        <myinfo>
          <user_id>12345</user_id>
          <user_name>Zelmari</user_name>
        </myinfo>
        <anime>
          <series_animedb_id>52991</series_animedb_id>
          <series_title><![CDATA[Sousou no Frieren]]></series_title>
          <series_type>TV</series_type>
          <series_episodes>28</series_episodes>
          <my_watched_episodes>28</my_watched_episodes>
          <my_score>10</my_score>
          <my_status>2</my_status>
          <my_comments><![CDATA[Peak anime]]></my_comments>
        </anime>
        <anime>
          <series_animedb_id>5114</series_animedb_id>
          <series_title>Fullmetal Alchemist: Brotherhood</series_title>
          <series_type>TV</series_type>
          <series_episodes>64</series_episodes>
          <my_watched_episodes>12</my_watched_episodes>
          <my_score>9</my_score>
          <my_status>watching</my_status>
        </anime>
      </myanimelist>`;

    const items = parseImportFile('animelist.xml', malXml);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Sousou no Frieren',
      category: 'anime',
      status: 'completed',
      secondaryUnitCurrent: 28,
      secondaryUnitTotal: 28,
      rating: 10,
      notes: 'Peak anime',
      sourceId: 'mal-52991',
    });
    expect(items[1]).toMatchObject({
      title: 'Fullmetal Alchemist: Brotherhood',
      category: 'anime',
      status: 'in_progress',
      secondaryUnitCurrent: 12,
      secondaryUnitTotal: 64,
      rating: 9,
      sourceId: 'mal-5114',
    });
  });

  it('parses MyAnimeList manga exports with chapter and volume progress', () => {
    const malXml = `<?xml version="1.0" encoding="UTF-8" ?>
      <myanimelist>
        <manga>
          <manga_mangadb_id>2</manga_mangadb_id>
          <manga_title>Berserk</manga_title>
          <series_chapters>364</series_chapters>
          <series_volumes>41</series_volumes>
          <my_read_chapters>120</my_read_chapters>
          <my_read_volumes>12</my_read_volumes>
          <my_score>10</my_score>
          <my_status>1</my_status>
        </manga>
      </myanimelist>`;

    const items = parseImportFile('mangalist.xml', malXml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Berserk',
      category: 'manga',
      status: 'in_progress',
      secondaryUnitCurrent: 120,
      secondaryUnitTotal: 364,
      primaryUnitCurrent: 12,
      primaryUnitTotal: 41,
      rating: 10,
      sourceId: 'mal-manga-2',
    });
  });

  it('decompresses and parses .xml.gz MyAnimeList exports', async () => {
    const malXml = `<?xml version="1.0" encoding="UTF-8" ?>
      <myanimelist>
        <anime>
          <series_animedb_id>1</series_animedb_id>
          <series_title>Cowboy Bebop</series_title>
          <series_type>TV</series_type>
          <series_episodes>26</series_episodes>
          <my_watched_episodes>26</my_watched_episodes>
          <my_score>10</my_score>
          <my_status>2</my_status>
        </anime>
      </myanimelist>`;

    const gzippedBuffer = await compressToGzip(malXml);
    const decompressed = await decompressGzip(gzippedBuffer);
    expect(decompressed).toContain('Cowboy Bebop');

    const items = await parseImportBuffer('animelist.xml.gz', gzippedBuffer);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Cowboy Bebop',
      category: 'anime',
      status: 'completed',
      secondaryUnitCurrent: 26,
      secondaryUnitTotal: 26,
      rating: 10,
      sourceId: 'mal-1',
    });
  });

  it('skips null, primitive, and title-less JSON array items', () => {
    const payload = [null, 42, 'nope', {}, { title: '   ' }, { title: 'Survivor' }];
    const items = parseImportFile('backup.json', JSON.stringify(payload));
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Survivor');
  });

  it('tolerates null lists and null entries in AniList exports', () => {
    const payload = {
      data: {
        MediaListCollection: {
          lists: [
            null,
            {
              entries: [null, { progress: 1, media: { type: 'ANIME', title: { english: 'OK' } } }],
            },
          ],
        },
      },
    };
    const items = parseImportFile('anilist.json', JSON.stringify(payload));
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('OK');
  });

  it('parses Simkl JSON exports with shows, anime, and movies', () => {
    const simklPayload = {
      shows: [
        {
          show: {
            title: 'Severance',
            year: 2022,
            ids: { simkl: 123456 },
            total_episodes: 9,
          },
          status: 'completed',
          user_rating: 10,
          watched_episodes_count: 9,
        },
      ],
      anime: [
        {
          anime: {
            title: 'Steins;Gate',
            year: 2011,
            ids: { simkl: 654321 },
            total_episodes: 24,
          },
          status: 'watching',
          user_rating: 9,
          watched_episodes_count: 14,
        },
      ],
    };

    const items = parseImportFile('simkl_backup.json', JSON.stringify(simklPayload));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Severance',
      category: 'show',
      status: 'completed',
      secondaryUnitCurrent: 9,
      secondaryUnitTotal: 9,
      rating: 10,
      sourceId: 'simkl-123456',
    });
    expect(items[1]).toMatchObject({
      title: 'Steins;Gate',
      category: 'anime',
      status: 'in_progress',
      secondaryUnitCurrent: 14,
      secondaryUnitTotal: 24,
      rating: 9,
      sourceId: 'simkl-654321',
    });
  });

  it('parses Letterboxd CSV exports (diary, ratings, watched, watchlist)', () => {
    const diaryCsv = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-01-10,Inception,2010,https://boxd.it/123,4.5,Yes,"sci-fi, thriller",2026-01-10
2026-02-15,Parasite,2019,https://boxd.it/456,5.0,No,drama,2026-02-15
`;
    const items = parseImportFile('diary.csv', diaryCsv);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Inception',
      category: 'movie',
      status: 'completed',
      primaryUnitCurrent: 2, // Rewatch
      primaryUnitTotal: 1,
      rewatchCount: 1,
      rating: 9, // 4.5 * 2 = 9
      tags: ['sci-fi', 'thriller'],
    });
    expect(items[1]).toMatchObject({
      title: 'Parasite',
      category: 'movie',
      status: 'completed',
      primaryUnitCurrent: 1,
      primaryUnitTotal: 1,
      rating: 10, // 5.0 * 2 = 10
      tags: ['drama'],
    });
  });

  it('parses Letterboxd watchlist CSV as planning status', () => {
    const watchlistCsv = `Date,Name,Year,Letterboxd URI
2026-01-01,Dune: Part Two,2024,https://boxd.it/789
`;
    const items = parseImportFile('watchlist.csv', watchlistCsv);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Dune: Part Two',
      category: 'movie',
      status: 'planning',
      primaryUnitCurrent: 1,
    });
  });
});

describe('decompressGzip', () => {
  it('rejects decompressed payloads that exceed the size cap', async () => {
    const gzippedBuffer = await compressToGzip('x'.repeat(64));
    await expect(decompressGzip(gzippedBuffer, 16)).rejects.toThrow('too large');
  });
});
