import type { MediaRow } from '@/domain/media';
import { updateMediaProgressForUser } from '@/domain/media';
import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';
import { formatShelf } from '../format/labels';

export async function runStatusStep(
  userId: string,
  entry: MediaRow,
  newStatus: string,
  reason?: string,
) {
  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'dropped' && reason) {
    updates.dropReason = reason;
  }

  return updateMediaProgressForUser(userId, entry.id, updates);
}

export function formatStatusStepMessage(updated: { title: string }, newStatus: string): string {
  return `Moved **${updated.title}** to **${formatShelf(newStatus)}**.`;
}

export async function handleStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);
  const newStatus = interaction.options.getString('status', true);
  const reason = interaction.options.getString('reason') || undefined;

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  const outcome = resolveTitleForCommand(resolved, {
    discordUserId: interaction.user.id,
    userId: user.userId,
    command: 'status',
    extras: { status: newStatus, reason },
  });

  const entry = await replyForTitleResolution(interaction, outcome);
  if (!entry) return;

  const updated = await runStatusStep(user.userId, entry, newStatus, reason);
  await interaction.editReply({ content: formatStatusStepMessage(updated, newStatus) });
}
