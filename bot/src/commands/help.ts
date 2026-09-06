import type { ChatInputCommandInteraction } from 'discord.js';
import { createBaseEmbed } from '../format/embeds';
import { botEnv } from '../env';

export async function handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = createBaseEmbed('ZedArchive Discord Companion').setDescription(
    `Your media tracking archive on Discord. All logs sync directly to [${botEnv.APP_URL}](${botEnv.APP_URL}).\n\n` +
      '**Commands:**\n' +
      '• `/add` — Search catalog or enter a manual title (draft inspector)\n' +
      '• `/title <title>` — Inspect a title card (+1, Complete, Edit buttons)\n' +
      '• `/edit <title>` — Folio hub (log progress, change status, rate, edit notes)\n' +
      '• `/next <title>` — Step +1 episode or chapter (movies: marks completed without runtime)\n' +
      '• `/complete <title>` — Mark completed (status-only, keeps episode numbers)\n' +
      '• `/status <title> <status>` — Move title to any shelf\n' +
      '• `/drop <title> [reason]` — Drop a title with an optional reason\n' +
      '• `/rate <title> <score>` — Rate from 1 to 10\n' +
      '• `/now` — View your current in-progress list\n' +
      '• `/library` — Browse and filter your personal archive\n' +
      '• `/stats` — Archive totals, breakdown, and completion rate\n' +
      '• `/streak` — View your daily activity streak\n' +
      '• `/airing` — Upcoming broadcast airdates for active shows/anime\n' +
      '• `/link <code>` — Connect your ZedArchive account (ephemeral reply; optional confirmation DM)\n' +
      '• `/whoami` — Check connected ZedArchive account\n' +
      '• `/unlink` — Sever account connection',
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}
