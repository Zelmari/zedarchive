import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';
import { createBaseEmbed, applyCoverThumbnail, truncateText } from '../format/embeds';
import { formatProgressString } from '../format/progress';
import { formatShelf, formatCategory } from '../format/labels';
import type { MediaRow } from '@/domain/media';

export function buildTitleCard(entry: MediaRow): {
  embed: ReturnType<typeof createBaseEmbed>;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const progressStr = formatProgressString(entry);

  const embed = createBaseEmbed(entry.title).addFields(
    { name: 'Category', value: formatCategory(entry.category), inline: true },
    { name: 'Status', value: formatShelf(entry.status), inline: true },
    { name: 'Progress', value: `\`${progressStr}\``, inline: true },
  );

  if (entry.rating) {
    embed.addFields({ name: 'Rating', value: `★ ${entry.rating}/10`, inline: true });
  }

  if (entry.startedAt) {
    embed.addFields({
      name: 'Started',
      value: new Date(entry.startedAt).toLocaleDateString(),
      inline: true,
    });
  }

  if (entry.completedAt) {
    embed.addFields({
      name: 'Completed',
      value: new Date(entry.completedAt).toLocaleDateString(),
      inline: true,
    });
  }

  if (entry.notes) {
    embed.addFields({
      name: 'Notes',
      value: truncateText(entry.notes, 300),
    });
  }

  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    embed.addFields({
      name: 'Tags',
      value: (entry.tags as string[]).map((t) => `\`#${t}\``).join(' '),
    });
  }

  applyCoverThumbnail(embed, entry.coverImage);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`za:title:${entry.id}:step`)
      .setLabel('+1 Progress')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`za:title:${entry.id}:complete`)
      .setLabel('Complete')
      .setStyle(ButtonStyle.Success)
      .setDisabled(entry.status === 'completed'),
    new ButtonBuilder()
      .setCustomId(`za:title:${entry.id}:edit`)
      .setLabel('Edit Details')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row };
}

export async function handleTitleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const query = interaction.options.getString('title', true);

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, query);
  const outcome = resolveTitleForCommand(resolved, {
    discordUserId: interaction.user.id,
    userId: user.userId,
    command: 'title',
  });

  const entry = await replyForTitleResolution(interaction, outcome);
  if (!entry) return;

  const { embed, row } = buildTitleCard(entry);

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}
