import type { ChatInputCommandInteraction } from 'discord.js';
import { resolveZedUserFromDiscordId, getDiscordLinkByDiscordUserId } from '@/domain/discord-link';
import { botEnv } from '../env';
import { createBaseEmbed } from '../format/embeds';

export async function handleWhoamiCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await resolveZedUserFromDiscordId(interaction.user.id);

  if (!user) {
    await interaction.reply({
      content: `Your Discord account is not linked to ZedArchive.\n\nTo link: Open ${botEnv.APP_URL}/settings, generate a link code, and run \`/link <code>\`.`,
      ephemeral: true,
    });
    return;
  }

  const link = await getDiscordLinkByDiscordUserId(interaction.user.id);
  const linkedDate = link?.createdAt
    ? link.createdAt.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

  const embed = createBaseEmbed('Connected ZedArchive Profile').addFields(
    { name: 'Display Name', value: user.name, inline: true },
    { name: 'Handle', value: user.username ? `@${user.username}` : 'Not set', inline: true },
    { name: 'Linked', value: linkedDate, inline: true },
    { name: 'Archive URL', value: `${botEnv.APP_URL}/dashboard` },
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}
