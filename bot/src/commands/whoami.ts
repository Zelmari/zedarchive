import type { ChatInputCommandInteraction } from 'discord.js';
import { resolveZedUserFromDiscordId, getDiscordLinkByDiscordUserId } from '@/domain/discord-link';
import { botEnv } from '../env';
import { buildChromeFolio } from '../format/folio';
import { folioReplyOptions } from '../format/reply-cover';

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

  const body =
    `**Display Name:** ${user.name}\n` +
    `**Handle:** ${user.username ? `@${user.username}` : 'Not set'}\n` +
    `**Linked:** ${linkedDate}\n` +
    `**Archive URL:** ${botEnv.APP_URL}/dashboard`;

  await interaction.reply(
    folioReplyOptions(buildChromeFolio({ heading: 'Connected ZedArchive Profile', body })),
  );
}
