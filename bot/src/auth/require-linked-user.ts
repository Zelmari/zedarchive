import type {
  CommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { resolveZedUserFromDiscordId, type ResolvedZedUser } from '@/domain/discord-link';
import { botEnv } from '../env';

export async function requireLinkedUser(
  interaction:
    CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
): Promise<ResolvedZedUser | null> {
  const discordUserId = interaction.user.id;
  const user = await resolveZedUserFromDiscordId(discordUserId);

  if (!user) {
    const linkMsg = `Link your archive first. Open ${botEnv.APP_URL}/settings, generate a Discord code, then DM me \`/link\`.`;
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: linkMsg });
      } else {
        await interaction.reply({ content: linkMsg, ephemeral: true });
      }
    }
    return null;
  }

  return user;
}
