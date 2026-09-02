import type { SearchResult } from '@/types/search';
import { httpsCover } from '@/lib/format';

type SearchCategory = 'book' | 'manga';

interface BookSearchOptions {
  category: SearchCategory;
  querySuffix?: string;
}

interface GBooksItem {
  id: string;
  volumeInfo?: Record<string, unknown>;
}

function buildSearchQuery(query: string, querySuffix?: string): string {
  const suffix = querySuffix?.trim();
  return suffix ? `${query} ${suffix}` : query;
}

function toGBooksResult(item: GBooksItem, category: SearchCategory): SearchResult {
  const info = item.volumeInfo || {};
  const imageLinks = info.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined;
  const coverUrl = httpsCover(imageLinks?.thumbnail || imageLinks?.smallThumbnail);

  return {
    sourceId: `gbooks-${item.id}`,
    category,
    title: (info.title as string) || 'Unknown Title',
    coverUrl,
    primaryUnitTotal: 1,
    structure: [],
    secondaryUnitTotal: typeof info.pageCount === 'number' ? info.pageCount : null,
    authors: Array.isArray(info.authors) ? info.authors.join(', ') : null,
    year: info.publishedDate ? String(info.publishedDate).substring(0, 4) : null,
  };
}

export async function searchOpenLibrary(
  query: string,
  { category, querySuffix }: BookSearchOptions = { category: 'book' },
): Promise<SearchResult[] | null> {
  try {
    const searchQuery = buildSearchQuery(query, querySuffix);
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(searchQuery)}&limit=5`;
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
        category,
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

export async function searchGoogleBooks(
  query: string,
  { category, querySuffix }: BookSearchOptions = { category: 'book' },
): Promise<SearchResult[] | null> {
  try {
    const searchQuery = buildSearchQuery(query, querySuffix);
    const gbooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}&maxResults=5`;
    const gbooksRes = await fetch(gbooksUrl, {
      next: { revalidate: 86400 },
      headers: { Accept: 'application/json' },
    });

    if (!gbooksRes.ok) return null;

    const gbooksData = (await gbooksRes.json()) as { items?: GBooksItem[] };
    if (Array.isArray(gbooksData.items) && gbooksData.items.length > 0) {
      return gbooksData.items.map((item) => toGBooksResult(item, category));
    }
    return null;
  } catch (err) {
    console.warn(
      'Google Books failed, falling back to Open Library:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function searchBooks(query: string): Promise<SearchResult[] | null> {
  const gbooksResults = await searchGoogleBooks(query, {
    category: 'book',
    querySuffix: '',
  });
  if (gbooksResults?.length) {
    return gbooksResults;
  }
  return searchOpenLibrary(query, { category: 'book', querySuffix: '' });
}
