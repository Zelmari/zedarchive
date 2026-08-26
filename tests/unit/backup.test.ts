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
    });
  });

  it('rejects unrecognized JSON with a friendly message', () => {
    expect(() => parseImportFile('x.json', '{"hello":1}')).toThrow(
      'Unrecognized JSON format. Please upload a ZedArchive backup or supported export.',
    );
  });

  it('parses Goodreads-style CSV rows', () => {
    const csv = 'Book Id,Title,Author\n1,"Bell Hooks, All About Love",someone\n2,Atomic Habits,x\n';
    const items = parseImportFile('books.csv', csv);
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('Bell Hooks, All About Love');
    expect(items[0]?.category).toBe('book');
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
});
