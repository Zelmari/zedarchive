import { EmbedBuilder } from 'discord.js';

export const ZED_ACCENT_COLOR = 0xb08d57;

/**
 * Creates a standard ZedArchive Discord Embed with consistent brand color and footer.
 */
export function createBaseEmbed(title?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(ZED_ACCENT_COLOR)
    .setFooter({ text: 'ZedArchive' })
    .setTimestamp(new Date());

  if (title) {
    embed.setTitle(title);
  }

  return embed;
}

/**
 * Sets thumbnail only if url is a valid HTTPS link.
 * Avoids base64 data URLs which Discord rejects.
 */
export function applyCoverThumbnail(embed: EmbedBuilder, coverUrl?: string | null): EmbedBuilder {
  if (coverUrl && coverUrl.startsWith('https://')) {
    embed.setThumbnail(coverUrl);
  }
  return embed;
}

/**
 * Strips HTML / complex markdown and truncates text for embeds.
 */
export function truncateText(text?: string | null, maxLength = 300): string {
  if (!text) return '';
  const clean = text.replace(/<[^>]*>/g, '').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1) + '…';
}
