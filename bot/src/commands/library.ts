import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { listPersonalLibraryLite } from '@/domain/media';
import { createBaseEmbed } from '../format/embeds';
import { formatProgressString } from '../format/progress';

export async function handleLibraryCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const status = interaction.options.getString('status') || 'in_progress';
  const category = interaction.options.getString('category') || undefined;
  const query = interaction.options.getString('query') || undefined;

  await interaction.deferReply({ ephemeral: true });

  const entries = await listPersonalLibraryLite(user.userId, {
    status,
    category,
    query,
    limit: 15,
  });

  if (entries.length === 0) {
    await interaction.editReply({
      content: 'No matching titles found in your personal archive.',
    });
    return;
  }

  const titleHeader =
    status === 'any' ? 'Personal Archive' : `Archive — ${status.replace('_', ' ')}`;
  const embed = createBaseEmbed(titleHeader);

  const lines = entries.map((e, index) => {
    const progress = formatProgressString(e);
    const ratingPart = e.rating ? ` • ★ ${e.rating}` : '';
    const statusBadge = status === 'any' ? ` [${e.status}]` : '';
    return (
      `**${index + 1}. ${e.title}** (${e.category})${statusBadge}\n` +
      `└ \`${progress}\`${ratingPart}`
    );
  });

  embed.setDescription(lines.join('\n\n'));

  await interaction.editReply({ embeds: [embed] });
}
