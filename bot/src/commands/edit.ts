import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type AttachmentBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';
import { coverToDiscordMedia } from '../format/cover-attachment';
import { coverEditReplyOptions } from '../format/reply-cover';
import { createBaseEmbed, truncateText } from '../format/embeds';
import { formatProgressString } from '../format/progress';
import { formatShelf, formatCategory } from '../format/labels';
import type { MediaRow } from '@/domain/media';

export function buildEditInspector(entry: MediaRow): {
  embed: ReturnType<typeof createBaseEmbed>;
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
  files: AttachmentBuilder[];
} {
  const progressStr = formatProgressString(entry);
  const statusLabel = formatShelf(entry.status);

  const embed = createBaseEmbed(`Editing: ${entry.title}`)
    .setDescription(
      'Select an action below to update progress, shelf status, rating, or personal notes.',
    )
    .addFields(
      { name: 'Category', value: formatCategory(entry.category), inline: true },
      { name: 'Current Status', value: statusLabel, inline: true },
      { name: 'Current Progress', value: `\`${progressStr}\``, inline: true },
    );

  if (entry.rating) {
    embed.addFields({ name: 'Rating', value: `★ ${entry.rating}/10`, inline: true });
  }

  if (entry.notes) {
    embed.addFields({ name: 'Notes', value: truncateText(entry.notes, 200) });
  }

  const cover = coverToDiscordMedia(entry.coverImage);
  if (cover.thumbnailUrl) embed.setThumbnail(cover.thumbnailUrl);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`za:edit:${entry.id}:modal_progress`)
      .setLabel('Set Progress')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`za:edit:${entry.id}:modal_notes`)
      .setLabel('Edit Notes')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`za:edit:${entry.id}:complete`)
      .setLabel('Complete')
      .setStyle(ButtonStyle.Success)
      .setDisabled(entry.status === 'completed'),
  );

  const statusRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`za:edit:${entry.id}:select_status`)
      .setPlaceholder(`Shelf: ${statusLabel}`)
      .addOptions([
        { label: 'In Progress', value: 'in_progress', default: entry.status === 'in_progress' },
        { label: 'Completed', value: 'completed', default: entry.status === 'completed' },
        { label: 'Planning', value: 'planning', default: entry.status === 'planning' },
        { label: 'On Hold', value: 'on_hold', default: entry.status === 'on_hold' },
        { label: 'Dropped', value: 'dropped', default: entry.status === 'dropped' },
      ]),
  );

  const rateOptions = [
    { label: 'Clear Rating', value: '0' },
    ...Array.from({ length: 10 }, (_, i) => ({
      label: `★ ${i + 1}/10`,
      value: String(i + 1),
      default: entry.rating === i + 1,
    })),
  ];

  const rateRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`za:edit:${entry.id}:select_rate`)
      .setPlaceholder(entry.rating ? `Rating: ★ ${entry.rating}/10` : 'Set Rating')
      .addOptions(rateOptions),
  );

  return { embed, components: [buttonRow, statusRow, rateRow], files: cover.files };
}

export async function handleEditCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  const outcome = resolveTitleForCommand(resolved, {
    discordUserId: interaction.user.id,
    userId: user.userId,
    command: 'edit',
  });

  const entry = await replyForTitleResolution(interaction, outcome);
  if (!entry) return;

  const { embed, components, files } = buildEditInspector(entry);

  await interaction.editReply(
    coverEditReplyOptions({
      embeds: [embed],
      components,
      files,
    }),
  );
}
