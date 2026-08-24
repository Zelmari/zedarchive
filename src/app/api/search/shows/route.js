export const revalidate = 86400;

const MAX_QUERY_LENGTH = 100;

function parseQuery(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || searchParams.get('query') || '';
  const trimmed = query.trim();
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { error: Response.json(
      { results: [], error: 'Query too long' },
      { status: 400 }
    ) };
  }
  return { query: trimmed };
}

export async function GET(request) {
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

    const searchData = await searchRes.json();
    const topResults = Array.isArray(searchData) ? searchData.slice(0, 5) : [];

    const results = await Promise.all(
      topResults.map(async ({ show }) => {
        let seasons = [];
        try {
          const seasonsRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/seasons`, {
            next: { revalidate: 86400 },
            headers: {
              Accept: 'application/json',
            },
          });
          if (seasonsRes.ok) {
            seasons = await seasonsRes.json();
          }
        } catch {
          seasons = [];
        }

        const structureArray = Array.isArray(seasons)
          ? seasons
              .filter((s) => s.number !== null && s.number !== undefined && s.number > 0)
              .map((s) => ({
                number: s.number,
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

    return Response.json({ results });
  } catch (error) {
    console.error('TVMaze search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch TV shows' }, { status: 500 });
  }
}