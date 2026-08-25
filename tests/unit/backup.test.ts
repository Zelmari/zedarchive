import { describe, it, expect } from 'vitest';
import { parseImportFile } from '@/lib/backup';

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
});
