import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { listPersonalLibraryLite } from '@/domain/media';
import { calculateArchiveStats } from '@/lib/stats';
import { createBaseEmbed } from '../format/embeds';

export async function handleStatsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  await interaction.deferReply({ ephemeral: true });

  const entries = await listPersonalLibraryLite(user.userId);

  if (entries.length === 0) {
    await interaction.editReply({
      content: 'Your archive is empty. Track your first title with `/add`!',
    });
    return;
  }

  const stats = calculateArchiveStats(entries as any);

  const embed = createBaseEmbed('Archive Statistics').addFields(
    {
      name: 'Overview',
      value:
        `**Total Titles:** ${stats.totalEntries}\n` +
        `**Completed:** ${stats.completedCount} (${stats.completionRate}%)\n` +
        `**In Progress:** ${stats.inProgressCount}\n` +
        `**Average Rating:** ★ ${stats.avgRating}`,
    },
    {
      name: 'By Category',
      value:
        `📺 **Shows:** ${stats.showCount} (${stats.totalEpisodes} eps)\n` +
        `🎬 **Movies:** ${stats.movieCount} (${stats.totalMovieMinutes} min)\n` +
        `📖 **Books:** ${stats.bookCount}\n` +
        `⛩️ **Anime:** ${stats.animeCount}\n` +
        `📚 **Manga:** ${stats.mangaCount} (${stats.totalChapters} ch)`,
    },
  );

  if (stats.topRated.length > 0) {
    const topList = stats.topRated
      .map((t, i) => `${i + 1}. **${t.title}** (★ ${t.rating})`)
      .join('\n');
    embed.addFields({ name: 'Top Rated', value: topList });
  }

  await interaction.editReply({ embeds: [embed] });
}
