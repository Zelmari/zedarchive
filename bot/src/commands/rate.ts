import type { MediaRow } from '@/domain/media';
import { updateMediaProgressForUser } from '@/domain/media';
import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';

export async function runRateStep(userId: string, entry: MediaRow, score: number) {
  return updateMediaProgressForUser(userId, entry.id, { rating: score });
}

export function formatRateStepMessage(updated: { title: string }, score: number): string {
  return `Rated **${updated.title}** **${score}/10**.`;
}

export async function handleRateCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);
  const score = interaction.options.getInteger('score', true);

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  const outcome = resolveTitleForCommand(resolved, {
    discordUserId: interaction.user.id,
    userId: user.userId,
    command: 'rate',
    extras: { score },
  });

  const entry = await replyForTitleResolution(interaction, outcome);
  if (!entry) return;

  const updated = await runRateStep(user.userId, entry, score);
  await interaction.editReply({ content: formatRateStepMessage(updated, score) });
}
