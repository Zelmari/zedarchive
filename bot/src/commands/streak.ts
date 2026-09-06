import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { getUserStreakForUser } from '@/domain/activity-log';
import { folioEditReplyOptions } from '../format/reply-cover';
import { buildChromeFolio } from '../format/folio';

export async function handleStreakCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  await interaction.deferReply({ ephemeral: true });

  const { streak } = await getUserStreakForUser(user.userId);

  let body: string;
  if (streak === 0) {
    body =
      '**0 days**\n\nYou have not logged any activity today or yesterday. Log an episode, chapter, or rating to start a new streak!';
  } else if (streak === 1) {
    body = '**1 day streak!**\n\nYou logged activity today. Keep it going tomorrow!';
  } else {
    body = `**${streak} days streak!**\n\nYou have logged activity for ${streak} consecutive days. Keep the momentum going!`;
  }

  await interaction.editReply(
    folioEditReplyOptions(buildChromeFolio({ heading: 'Daily Tracking Streak', body })),
  );
}
