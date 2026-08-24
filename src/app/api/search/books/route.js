export const revalidate = 86400;

const MAX_QUERY_LENGTH = 100;

async function searchOpenLibrary(query) {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const docs = Array.isArray(data.docs) ? data.docs : [];

    return docs.map((doc) => {
      const coverUrl = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : null;

      const cleanKey = doc.key ? doc.key.replace(/^\/works\//, '') : null;

      return {
        sourceId: `openlib-${cleanKey || doc.title || query}`,
        category: 'book',
        title: doc.title || 'Unknown Title',
        coverUrl,
        primaryUnitTotal: 1,
        structure: [],
        secondaryUnitTotal: doc.number_of_pages_median || null,
        authors: Array.isArray(doc.author_name) ? doc.author_name.join(', ') : null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : null,
      };
    });
  } catch (err) {
    console.error('Open Library fallback error:', err);
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json({ results: [], error: 'Query too long' }, { status: 400 });
  }

  if (!query) {
    return Response.json({ results: [] });
  }

  try {
    // 1. Try Google Books API
    try {
      const gbooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`;
      const gbooksRes = await fetch(gbooksUrl, {
        next: { revalidate: 86400 },
        headers: {
          Accept: 'application/json',
        },
      });

      if (gbooksRes.ok) {
        const gbooksData = await gbooksRes.json();
        if (Array.isArray(gbooksData.items) && gbooksData.items.length > 0) {
          const results = gbooksData.items.map((item) => {
            const info = item.volumeInfo || {};
            let coverUrl = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
            if (coverUrl && coverUrl.startsWith('http://')) {
              coverUrl = coverUrl.replace('http://', 'https://');
            }

            return {
              sourceId: `gbooks-${item.id}`,
              category: 'book',
              title: info.title || 'Unknown Title',
              coverUrl,
              primaryUnitTotal: 1,
              structure: [],
              secondaryUnitTotal: typeof info.pageCount === 'number' ? info.pageCount : null,
              authors: Array.isArray(info.authors) ? info.authors.join(', ') : null,
              year: info.publishedDate ? info.publishedDate.substring(0, 4) : null,
            };
          });

          return Response.json({ results });
        }
      }
    } catch (gbooksErr) {
      console.warn('Google Books failed, falling back to Open Library:', gbooksErr.message);
    }

    // 2. Fallback to Open Library
    const fallbackResults = await searchOpenLibrary(query);
    if (fallbackResults === null) {
      return Response.json(
        { results: [], error: 'Search service unavailable' },
        { status: 502 }
      );
    }
    return Response.json({ results: fallbackResults });
  } catch (error) {
    console.error('Books search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch books' }, { status: 500 });
  }
}