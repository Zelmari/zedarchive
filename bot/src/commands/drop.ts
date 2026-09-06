import type { MediaRow } from '@/domain/media';
import { updateMediaProgressForUser } from '@/domain/media';
import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';

export async function runDropStep(userId: string, entry: MediaRow, reason?: string) {
  const updates: Record<string, unknown> = {
    status: 'dropped',
    ...(reason ? { dropReason: reason } : {}),
  };

  return updateMediaProgressForUser(userId, entry.id, updates);
}

export function formatDropStepMessage(updated: { title: string }, reason?: string): string {
  const reasonStr = reason ? ` Reason: "${reason}".` : '';
  return `Marked **${updated.title}** as dropped.${reasonStr}`;
}

export async function handleDropCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);
  const reason = interaction.options.getString('reason') || undefined;

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  const outcome = resolveTitleForCommand(resolved, {
    discordUserId: interaction.user.id,
    userId: user.userId,
    command: 'drop',
    extras: { reason },
  });

  const entry = await replyForTitleResolution(interaction, outcome);
  if (!entry) return;

  const updated = await runDropStep(user.userId, entry, reason);
  await interaction.editReply({ content: formatDropStepMessage(updated, reason) });
}
