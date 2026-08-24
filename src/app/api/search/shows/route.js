export const dynamic = 'force-dynamic';
export const revalidate = 86400;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || '';

    if (!query.trim()) {
      return Response.json({ results: [] });
    }

    const searchUrl = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query.trim())}`;
    const searchRes = await fetch(searchUrl, {
      next: { revalidate: 86400 },
      headers: {
        Accept: 'application/json',
      },
    });

    if (!searchRes.ok) {
      return Response.json({ results: [] });
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
          ? seasons.map((s) => ({
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
