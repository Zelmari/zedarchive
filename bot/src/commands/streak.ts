import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { getUserStreakForUser } from '@/domain/activity-log';
import { createBaseEmbed } from '../format/embeds';

export async function handleStreakCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  await interaction.deferReply({ ephemeral: true });

  const { streak } = await getUserStreakForUser(user.userId);

  const embed = createBaseEmbed('Daily Tracking Streak');

  if (streak === 0) {
    embed.setDescription(
      '🔥 **0 days**\n\nYou have not logged any activity today or yesterday. Log an episode, chapter, or rating to start a new streak!',
    );
  } else if (streak === 1) {
    embed.setDescription(
      '🔥 **1 day streak!**\n\nYou logged activity today. Keep it going tomorrow!',
    );
  } else {
    embed.setDescription(
      `🔥 **${streak} days streak!**\n\nYou have logged activity for ${streak} consecutive days. Keep the momentum going!`,
    );
  }

  await interaction.editReply({ embeds: [embed] });
}
