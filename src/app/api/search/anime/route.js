export const revalidate = 86400;

const MAX_QUERY_LENGTH = 100;

const ANILIST_QUERY = `
query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 5) {
    media(search: $search, type: $type, sort: POPULARITY_DESC) {
      id
      title {
        romaji
        english
      }
      coverImage {
        large
        medium
      }
      episodes
      chapters
      volumes
      format
      startDate {
        year
      }
    }
  }
}
`;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json({ results: [], error: 'Query too long' }, { status: 400 });
  }

  const rawType = (searchParams.get('type') || searchParams.get('category') || 'ANIME').toUpperCase();
  const mediaType = rawType === 'MANGA' ? 'MANGA' : 'ANIME';
  const isManga = mediaType === 'MANGA';

  if (!query) {
    return Response.json({ results: [] });
  }

  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: {
          search: query,
          type: mediaType,
        },
      }),
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return Response.json(
        { results: [], error: 'Search service unavailable' },
        { status: 502 }
      );
    }

    const json = await response.json();
    const mediaList = json.data?.Page?.media || [];

    const results = mediaList.map((item) => {
      const title = item.title?.english || item.title?.romaji || 'Unknown Title';
      let coverUrl = item.coverImage?.large || item.coverImage?.medium || null;
      if (coverUrl && coverUrl.startsWith('http://')) {
        coverUrl = coverUrl.replace('http://', 'https://');
      }

      if (isManga) {
        const volumeCount = item.volumes || 1;
        const structure = item.volumes
          ? Array.from({ length: item.volumes }, (_, i) => ({
              number: i + 1,
              name: `Volume ${i + 1}`,
              total: null,
            }))
          : [];

        return {
          sourceId: `anilist-${item.id}`,
          category: 'manga',
          title,
          coverUrl,
          primaryUnitTotal: volumeCount,
          structure,
          secondaryUnitTotal: item.chapters || null,
          year: item.startDate?.year ? String(item.startDate.year) : null,
        };
      }

      const structure = item.episodes
        ? [{ number: 1, name: 'Season 1', total: item.episodes }]
        : [];

      return {
        sourceId: `anilist-${item.id}`,
        category: 'anime',
        title,
        coverUrl,
        primaryUnitTotal: 1,
        structure,
        secondaryUnitTotal: item.episodes || null,
        year: item.startDate?.year ? String(item.startDate.year) : null,
      };
    });

    return Response.json({ results });
  } catch (error) {
    console.error('AniList search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch anime/manga' }, { status: 500 });
  }
}