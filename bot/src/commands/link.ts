import type { ChatInputCommandInteraction } from 'discord.js';
import { redeemDiscordLinkCode } from '@/domain/discord-link';
import { botEnv } from '../env';
import { logger } from '../logger';

export async function handleLinkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  // Always respond ephemerally so that neither the code nor the response is visible to anyone else
  await interaction.deferReply({ ephemeral: true });

  const code = interaction.options.getString('code', true).trim();

  try {
    const result = await redeemDiscordLinkCode({
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      code,
    });

    const handleText = result.username ? ` (@${result.username})` : '';

    // If run outside a 1-on-1 bot DM, also send a DM to the user directly
    if (interaction.guildId || !interaction.channel?.isDMBased()) {
      try {
        await interaction.user.send({
          content: `👋 **Welcome to ZedArchive!**\n\nYour Discord account has been successfully linked to **${result.name}**${handleText}.\n\nYou can chat with me here or use \`/now\`, \`/add\`, \`/next\`, \`/title\`, and \`/edit\` anywhere on Discord as a connected app. Dashboard: ${botEnv.APP_URL}/dashboard`,
        });
      } catch (dmErr) {
        logger.warn(`Could not send welcome DM to ${interaction.user.id}:`, dmErr);
      }
    }

    await interaction.editReply({
      content: `✅ Successfully linked your Discord account to **${result.name}**${handleText}!\n\n*(This confirmation is only visible to you).* Open your archive anytime at ${botEnv.APP_URL}/dashboard`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to redeem link code.';
    await interaction.editReply({
      content: `❌ ${message}`,
    });
  }
}
