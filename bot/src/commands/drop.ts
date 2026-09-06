import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { updateMediaProgressForUser } from '@/domain/media';

export async function handleDropCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);
  const reason = interaction.options.getString('reason') || undefined;

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  if (resolved.notFound || !resolved.entry) {
    await interaction.editReply({
      content: 'No title found in your archive. Use `/add` to track it first.',
    });
    return;
  }

  const updates: Record<string, unknown> = {
    status: 'dropped',
    ...(reason ? { dropReason: reason } : {}),
  };

  const updated = await updateMediaProgressForUser(user.userId, resolved.entry.id, updates);

  const reasonStr = reason ? ` (Reason: "${reason}")` : '';
  await interaction.editReply({
    content: `Marked **${updated.title}** as dropped${reasonStr}.`,
  });
}
