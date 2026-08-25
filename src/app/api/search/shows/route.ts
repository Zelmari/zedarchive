export const revalidate = 86400;

const MAX_QUERY_LENGTH = 100;

interface TvmazeImage {
  medium?: string | null;
  original?: string | null;
}

interface TvmazeShow {
  id: number;
  name: string;
  image?: TvmazeImage | null;
  premiered?: string | null;
}

interface TvmazeSeason {
  number?: number | null;
  name?: string | null;
  episodeOrder?: number | null;
}

interface SearchResult {
  sourceId: string;
  category: string;
  title: string;
  coverUrl: string | null;
  primaryUnitTotal: number;
  structure: Array<{ number: number; name: string; total: number | null }>;
  secondaryUnitTotal: number | null;
  year: string | null;
}

function parseQuery(request: Request): { query: string; error?: Response } {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || searchParams.get('query') || '';
  const trimmed = query.trim();
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      query: '',
      error: Response.json({ results: [], error: 'Query too long' }, { status: 400 }),
    };
  }
  return { query: trimmed };
}

export async function GET(request: Request): Promise<Response> {
  const { query, error } = parseQuery(request);
  if (error) return error;

  if (!query) {
    return Response.json({ results: [] });
  }

  try {
    const searchUrl = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, {
      next: { revalidate: 86400 },
      headers: {
        Accept: 'application/json',
      },
    });

    if (!searchRes.ok) {
      return Response.json(
        { results: [], error: 'Search service unavailable' },
        { status: 502 }
      );
    }

    const searchData: unknown = await searchRes.json();
    const topResults = Array.isArray(searchData)
      ? (searchData as { show?: TvmazeShow }[]).slice(0, 5)
      : [];

    const results = await Promise.all(
      topResults.map(async ({ show }): Promise<SearchResult | null> => {
        if (!show) return null;

        let seasons: TvmazeSeason[] = [];
        try {
          const seasonsRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/seasons`, {
            next: { revalidate: 86400 },
            headers: {
              Accept: 'application/json',
            },
          });
          if (seasonsRes.ok) {
            seasons = (await seasonsRes.json()) as TvmazeSeason[];
          }
        } catch {
          seasons = [];
        }

        const structureArray = Array.isArray(seasons)
          ? seasons
              .filter((s) => s.number !== null && s.number !== undefined && (s.number ?? 0) > 0)
              .map((s) => ({
                number: s.number as number,
                name: s.name ? s.name : `Season ${s.number}`,
                total: s.episodeOrder || null,
              }))
          : [];

        let coverUrl = show.image?.medium || show.image?.original || null;
        if (coverUrl && coverUrl.startsWith('http://')) {
          coverUrl = coverUrl.replace('http://', 'https://');
        }

        return {
          sourceId: `tvmaze-${show.id}`,
          category: 'show',
          title: show.name,
          coverUrl,
          primaryUnitTotal: structureArray.length || 1,
          structure: structureArray,
          secondaryUnitTotal: structureArray[0]?.total || null,
          year: show.premiered ? show.premiered.substring(0, 4) : null,
        };
      })
    );

    return Response.json({ results: results.filter(Boolean) });
  } catch (error) {
    console.error('TVMaze search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch TV shows' }, { status: 500 });
  }
}
