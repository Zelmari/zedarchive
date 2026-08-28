import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAnimeFillerGuide, resolveMalId } from '@/lib/services/anime';

describe('Anime Filler Guide', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveMalId', () => {
    it('extracts MAL id directly from mal- sourceId', async () => {
      const id = await resolveMalId('mal-20', 'Naruto');
      expect(id).toBe(20);
    });

    it('resolves anilist- ID to MAL ID via GraphQL', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            Media: {
              idMal: 269,
            },
          },
        }),
      } as Response);

      const id = await resolveMalId('anilist-269', 'Bleach');
      expect(id).toBe(269);
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe('fetchAnimeFillerGuide', () => {
    it('fetches and maps episode filler and recap flags accurately', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              mal_id: 1,
              title: 'Enter: Naruto Uzumaki!',
              episode: '1',
              filler: false,
              recap: false,
            },
            {
              mal_id: 26,
              title: 'Special Report: Live from the Forest of Death!',
              episode: '26',
              filler: false,
              recap: true,
            },
            {
              mal_id: 101,
              title: 'Gotta See! Gotta Know! Kakashi-Sensei True Face!',
              episode: '101',
              filler: true,
              recap: false,
            },
          ],
        }),
      } as Response);

      const guide = await fetchAnimeFillerGuide(20);
      expect(guide).not.toBeNull();
      expect(guide?.malId).toBe(20);
      expect(guide?.totalEpisodes).toBe(3);
      expect(guide?.episodes[1]?.type).toBe('canon');
      expect(guide?.episodes[26]?.type).toBe('recap');
      expect(guide?.episodes[101]?.type).toBe('filler');
    });

    it('returns null gracefully on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
      const guide = await fetchAnimeFillerGuide(999999);
      expect(guide).toBeNull();
    });
  });
});
