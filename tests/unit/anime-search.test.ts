import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchAnimeAndManga } from '@/lib/services/anime';

describe('anime and manga search', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls through to Google Books when AniList returns an empty array', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { Page: { media: [] } } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'manga-1',
                volumeInfo: {
                  title: 'Berserk',
                  pageCount: 120,
                  imageLinks: { thumbnail: 'http://example.com/cover.jpg' },
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const results = await searchAnimeAndManga('Berserk', true);

    expect(results).toMatchObject([
      {
        sourceId: 'gbooks-manga-1',
        category: 'manga',
        title: 'Berserk',
        coverUrl: 'https://example.com/cover.jpg',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('q=Berserk%20manga');
  });
});
