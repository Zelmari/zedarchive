import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { updateMediaProgressForUser } from '@/domain/media';

export async function handleRateCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);
  const score = interaction.options.getInteger('score', true);

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  if (resolved.notFound || !resolved.entry) {
    await interaction.editReply({
      content: 'No title found in your archive. Use `/add` to track it first.',
    });
    return;
  }

  const updated = await updateMediaProgressForUser(user.userId, resolved.entry.id, {
    rating: score,
  });

  await interaction.editReply({
    content: `⭐ Rated **${updated.title}** **${score}/10**!`,
  });
}
