import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';
import { folioEditReplyOptions } from '../format/reply-cover';
import { buildTitleFolio, type FolioMessage } from '../format/folio';
import type { MediaRow } from '@/domain/media';

function titleActionRow(entry: MediaRow): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
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
}

export function buildTitleCard(entry: MediaRow): FolioMessage {
  return buildTitleFolio(entry, entry.coverImage, [titleActionRow(entry)]);
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

  await interaction.editReply(folioEditReplyOptions(buildTitleCard(entry)));
}
