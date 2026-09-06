import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { listPersonalLibraryLite } from '@/domain/media';
import { createBaseEmbed } from '../format/embeds';
import { formatProgressString } from '../format/progress';

export async function handleNowCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  await interaction.deferReply({ ephemeral: true });

  const entries = await listPersonalLibraryLite(user.userId, {
    status: 'in_progress',
    limit: 10,
  });

  if (entries.length === 0) {
    await interaction.editReply({
      content: 'You have no titles currently in progress. Use `/add` to track something new!',
    });
    return;
  }

  const embed = createBaseEmbed('Currently In Progress');

  const lines = entries.map((e, index) => {
    const progress = formatProgressString(e);
    const ratingPart = e.rating ? ` ★ ${e.rating}/10` : '';
    return `**${index + 1}. ${e.title}** (${e.category})\n` + `└ \`${progress}\`${ratingPart}`;
  });

  embed.setDescription(lines.join('\n\n'));

  await interaction.editReply({ embeds: [embed] });
}
