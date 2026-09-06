import type { ChatInputCommandInteraction } from 'discord.js';
import { redeemDiscordLinkCode } from '@/domain/discord-link';
import { botEnv } from '../env';

export async function handleLinkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  // Reject in guilds: link codes are sensitive
  if (interaction.guildId) {
    await interaction.reply({
      content: 'Run this in a DM with me. Do not paste codes in a server channel.',
      ephemeral: true,
    });
    return;
  }

  const code = interaction.options.getString('code', true).trim();

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await redeemDiscordLinkCode({
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      code,
    });

    const handleText = result.username ? ` (@${result.username})` : '';
    await interaction.editReply({
      content: `✅ Successfully linked your Discord account to **${result.name}**${handleText}!\n\nOpen your archive anytime at ${botEnv.APP_URL}/dashboard`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to redeem link code.';
    await interaction.editReply({
      content: `❌ ${message}`,
    });
  }
}
