import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';
import { folioEditReplyOptions } from '../format/reply-cover';
import { buildEditFolio, type FolioActionRow, type FolioMessage } from '../format/folio';
import { formatShelf } from '../format/labels';
import type { MediaRow } from '@/domain/media';

function editActionRows(entry: MediaRow): FolioActionRow[] {
  const statusLabel = formatShelf(entry.status);

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

  return [buttonRow, statusRow, rateRow];
}

export function buildEditInspector(entry: MediaRow): FolioMessage {
  return buildEditFolio(entry, entry.coverImage, editActionRows(entry));
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

  await interaction.editReply(folioEditReplyOptions(buildEditInspector(entry)));
}
