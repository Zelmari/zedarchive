import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { completeMediaEntryForUser } from '@/domain/media';

export async function handleCompleteCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  if (resolved.notFound || !resolved.entry) {
    await interaction.editReply({
      content: 'No title found in your archive. Use `/add` to track it first.',
    });
    return;
  }

  const entry = resolved.entry;

  if (entry.status === 'completed') {
    await interaction.editReply({
      content: `Already marked completed. **${entry.title}** is currently on your Completed shelf.`,
    });
    return;
  }

  const updated = await completeMediaEntryForUser(user.userId, entry.id);

  await interaction.editReply({
    content: `🎉 Marked **${updated.title}** completed. Progress numbers were left as they were.`,
  });
}
