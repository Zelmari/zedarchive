import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { updateMediaProgressForUser } from '@/domain/media';

export async function handleStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);
  const newStatus = interaction.options.getString('status', true);
  const reason = interaction.options.getString('reason') || undefined;

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  if (resolved.notFound || !resolved.entry) {
    await interaction.editReply({
      content: 'No title found in your archive. Use `/add` to track it first.',
    });
    return;
  }

  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'dropped' && reason) {
    updates.dropReason = reason;
  }

  const updated = await updateMediaProgressForUser(user.userId, resolved.entry.id, updates);

  await interaction.editReply({
    content: `Moved **${updated.title}** to **${newStatus.replace('_', ' ')}**!`,
  });
}
