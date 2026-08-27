export const revalidate = 86400;

import { MAX_QUERY_LENGTH } from '@/lib/constants';
import type { SearchResult } from '@/types/search';

function httpsCover(url: string | null | undefined): string | null {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url ?? null;
}

async function searchOpenLibrary(query: string): Promise<SearchResult[] | null> {
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

    const data = (await res.json()) as Record<string, unknown>;
    const docs = Array.isArray(data.docs) ? (data.docs as Record<string, unknown>[]) : [];

    return docs.map((doc): SearchResult => {
      const coverUrl = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${String(doc.cover_i)}-M.jpg`
        : null;

      const cleanKey = doc.key ? String(doc.key).replace(/^\/works\//, '') : null;

      return {
        sourceId: `openlib-${cleanKey || doc.title || query}`,
        category: 'book',
        title: (doc.title as string) || 'Unknown Title',
        coverUrl,
        primaryUnitTotal: 1,
        structure: [],
        secondaryUnitTotal: (doc.number_of_pages_median as number) || null,
        authors: Array.isArray(doc.author_name) ? doc.author_name.join(', ') : null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : null,
      };
    });
  } catch (err) {
    console.error('Open Library fallback error:', err);
    return null;
  }
}

interface GBooksItem {
  id: string;
  volumeInfo?: Record<string, unknown>;
}

function toGBooksResult(item: GBooksItem): SearchResult {
  const info = item.volumeInfo || {};
  const imageLinks = info.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined;
  const coverUrl = httpsCover(imageLinks?.thumbnail || imageLinks?.smallThumbnail);

  return {
    sourceId: `gbooks-${item.id}`,
    category: 'book',
    title: (info.title as string) || 'Unknown Title',
    coverUrl,
    primaryUnitTotal: 1,
    structure: [],
    secondaryUnitTotal: typeof info.pageCount === 'number' ? info.pageCount : null,
    authors: Array.isArray(info.authors) ? info.authors.join(', ') : null,
    year: info.publishedDate ? String(info.publishedDate).substring(0, 4) : null,
  };
}

export async function GET(request: Request): Promise<Response> {
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
        const gbooksData = (await gbooksRes.json()) as { items?: GBooksItem[] };
        if (Array.isArray(gbooksData.items) && gbooksData.items.length > 0) {
          const results = gbooksData.items.map(toGBooksResult);
          return Response.json({ results });
        }
      }
    } catch (gbooksErr) {
      console.warn(
        'Google Books failed, falling back to Open Library:',
        gbooksErr instanceof Error ? gbooksErr.message : gbooksErr,
      );
    }

    // 2. Fallback to Open Library
    const fallbackResults = await searchOpenLibrary(query);
    if (fallbackResults === null) {
      return Response.json({ results: [], error: 'Search service unavailable' }, { status: 502 });
    }
    return Response.json({ results: fallbackResults });
  } catch (error) {
    console.error('Books search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch books' }, { status: 500 });
  }
}
