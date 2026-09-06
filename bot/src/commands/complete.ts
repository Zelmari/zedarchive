import type { MediaRow } from '@/domain/media';
import { completeMediaEntryForUser } from '@/domain/media';
import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';

export type CompleteStepResult =
  { kind: 'already_completed'; title: string } | { kind: 'completed'; title: string };

export async function runCompleteStep(
  userId: string,
  entry: MediaRow,
): Promise<CompleteStepResult> {
  if (entry.status === 'completed') {
    return { kind: 'already_completed', title: entry.title };
  }

  const updated = await completeMediaEntryForUser(userId, entry.id);
  return { kind: 'completed', title: updated.title };
}

export function formatCompleteStepMessage(result: CompleteStepResult): string {
  switch (result.kind) {
    case 'already_completed':
      return `Already marked completed. **${result.title}** is on your Completed shelf.`;
    case 'completed':
      return `Marked **${result.title}** completed. Progress numbers were left as they were.`;
  }
}

export async function handleCompleteCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  const outcome = resolveTitleForCommand(resolved, {
    discordUserId: interaction.user.id,
    userId: user.userId,
    command: 'complete',
  });

  const entry = await replyForTitleResolution(interaction, outcome);
  if (!entry) return;

  const result = await runCompleteStep(user.userId, entry);
  await interaction.editReply({ content: formatCompleteStepMessage(result) });
}
