import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';

export async function handleUnlinkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`za:auth:unlink_confirm:${interaction.user.id}`)
      .setLabel('Confirm Unlink')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`za:auth:unlink_cancel:${interaction.user.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content: `Are you sure you want to disconnect this Discord profile from **${user.name}**?`,
    components: [row],
    ephemeral: true,
  });
}
