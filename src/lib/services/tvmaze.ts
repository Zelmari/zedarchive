import type { SearchResult } from '@/types/search';
import type { NextAirInfo } from '@/types/media';
import { httpsCover } from '@/lib/format';

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

interface TvmazeEpisodeEmbed {
  season?: number;
  number?: number;
  airdate?: string;
  airstamp?: string | null;
}

interface TvmazeShowDetails {
  id?: number;
  status?: string;
  _embedded?: {
    nextepisode?: TvmazeEpisodeEmbed | null;
    previousepisode?: TvmazeEpisodeEmbed | null;
  };
}

type TvmazeCategory = 'show' | 'anime';

interface TvmazeSearchOptions {
  category: TvmazeCategory;
  emptyAsNull: boolean;
}

export function searchTvmaze(
  query: string,
  options: { category: 'show'; emptyAsNull: false },
): Promise<SearchResult[]>;
export function searchTvmaze(
  query: string,
  options: { category: 'anime'; emptyAsNull: true },
): Promise<SearchResult[] | null>;
export function searchTvmaze(
  query: string,
  options: TvmazeSearchOptions,
): Promise<SearchResult[] | null>;
export async function searchTvmaze(
  query: string,
  { category, emptyAsNull }: TvmazeSearchOptions,
): Promise<SearchResult[] | null> {
  const searchUrl = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`;
  const searchRes = await fetch(searchUrl, {
    next: { revalidate: 86400 },
    headers: { Accept: 'application/json' },
  });

  if (!searchRes.ok) {
    if (emptyAsNull) return null;
    throw new Error('Search service unavailable');
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
          headers: { Accept: 'application/json' },
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

      const coverUrl = httpsCover(show.image?.medium || show.image?.original);

      return {
        sourceId: `tvmaze-${show.id}`,
        category,
        title: show.name,
        coverUrl,
        primaryUnitTotal: structureArray.length || 1,
        structure: structureArray,
        secondaryUnitTotal: structureArray[0]?.total || null,
        year: show.premiered ? show.premiered.substring(0, 4) : null,
      };
    }),
  );

  const filtered = results.filter((r): r is SearchResult => r !== null);
  return emptyAsNull && filtered.length === 0 ? null : filtered;
}

export function searchTvmazeShows(query: string): Promise<SearchResult[]> {
  return searchTvmaze(query, { category: 'show', emptyAsNull: false });
}

export function searchTvmazeAnime(query: string): Promise<SearchResult[] | null> {
  return searchTvmaze(query, { category: 'anime', emptyAsNull: true });
}

export async function fetchTvmazeAirdates(
  ids: Array<{ sourceId: string; id: string }>,
  result: Record<string, NextAirInfo>,
): Promise<void> {
  await Promise.all(
    ids.map(async ({ sourceId, id }) => {
      try {
        const res = await fetch(
          `https://api.tvmaze.com/shows/${id}?embed=nextepisode&embed=previousepisode`,
          {
            headers: { Accept: 'application/json' },
          },
        );

        if (!res.ok) return;

        const data: TvmazeShowDetails = await res.json();
        const status = data.status || 'Running';

        if (status === 'Ended' || status === 'In Development') {
          return;
        }

        const nextEp = data._embedded?.nextepisode;
        if (nextEp && nextEp.airdate) {
          result[sourceId] = {
            season: typeof nextEp.season === 'number' ? nextEp.season : 1,
            number: typeof nextEp.number === 'number' ? nextEp.number : 1,
            airdate: nextEp.airdate,
            airstamp: nextEp.airstamp || null,
            status,
          };
        }
      } catch (err) {
        console.warn(`[airdate] TVMaze lookup failed for ${sourceId}:`, err);
      }
    }),
  );
}
