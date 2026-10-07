import { MAX_CANDIDATES } from './limits';

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on']);

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Scored<T> {
  entry: T;
  score: number;
  exact: boolean;
  titleContainsQuery: boolean;
}

/**
 * Normalized contains plus token overlap. No embeddings.
 * An exact title does not hide a longer title that still contains the query,
 * so "Dune" and "Dune Messiah" both stay when the person said "Dune".
 */
export function rankTitles<T extends { id: string; title: string }>(
  query: string,
  entries: readonly T[],
  limit = MAX_CANDIDATES,
): T[] {
  const normalizedQuery = normalizeTitle(query);
  if (!normalizedQuery) return [];
  const queryTokens = normalizedQuery.split(' ').filter((token) => !STOPWORDS.has(token));
  if (queryTokens.length === 0) return [];

  const scored: Scored<T>[] = [];
  for (const entry of entries) {
    const title = normalizeTitle(entry.title);
    if (!title) continue;
    const titleTokens = title.split(' ').filter((token) => token.length > 0);
    const exact = title === normalizedQuery;
    const titleContainsQuery = title.includes(normalizedQuery);
    const queryContainsTitle = normalizedQuery.includes(title) && title.length >= 4;
    const overlap = queryTokens.filter((token) => titleTokens.includes(token)).length;
    if (!exact && !titleContainsQuery && !queryContainsTitle && overlap === 0) continue;

    let score = overlap * 10;
    if (exact) score += 100;
    else if (titleContainsQuery) score += 50;
    else if (queryContainsTitle) score += 30;
    if (overlap === queryTokens.length) score += 15;
    scored.push({ entry, score, exact, titleContainsQuery });
  }

  if (scored.length === 0) return [];
  const hasExact = scored.some((row) => row.exact);
  const kept = hasExact
    ? scored.filter((row) => row.exact || row.titleContainsQuery)
    : scored.filter((row) => row.score >= 10);

  kept.sort(
    (a, b) =>
      b.score - a.score ||
      a.entry.title.localeCompare(b.entry.title) ||
      a.entry.id.localeCompare(b.entry.id),
  );
  return kept.slice(0, limit).map((row) => row.entry);
}
