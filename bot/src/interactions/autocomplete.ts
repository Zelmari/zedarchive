import type { AutocompleteInteraction } from 'discord.js';
import { resolveZedUserFromDiscordId } from '@/domain/discord-link';
import { listPersonalLibraryLite, type MediaLiteEntry } from '@/domain/media';
import { formatProgressString } from '../format/progress';

interface AutocompleteCacheItem {
  items: MediaLiteEntry[];
  cachedAt: number;
}

const autocompleteCache = new Map<string, AutocompleteCacheItem>();
const CACHE_TTL_MS = 15 * 1000; // 15 seconds

export async function handleTitleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const discordUserId = interaction.user.id;
  const user = await resolveZedUserFromDiscordId(discordUserId);

  if (!user) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  const query = (focused.value || '').trim();

  let entries: MediaLiteEntry[];
  const cacheKey = `${user.userId}:${query}`;
  const now = Date.now();
  const cached = autocompleteCache.get(cacheKey);

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    entries = cached.items;
  } else {
    entries = await listPersonalLibraryLite(user.userId, {
      query: query || undefined,
      limit: 25,
    });
    autocompleteCache.set(cacheKey, { items: entries, cachedAt: now });
    if (autocompleteCache.size > 500) {
      for (const [key, item] of autocompleteCache) {
        if (now - item.cachedAt >= CACHE_TTL_MS) autocompleteCache.delete(key);
      }
    }
  }

  const choices = entries.slice(0, 25).map((entry) => {
    const progress = formatProgressString(entry);
    const label = `${entry.title} (${progress})`.slice(0, 100);
    return {
      name: label,
      value: entry.id, // Return UUID in value as per design spec
    };
  });

  await interaction.respond(choices);
}
