import './env';
import './db';
import { botEnv } from './env';
import { logger } from './logger';
import { createBotClient } from './discord/client';
import { registerSlashCommands } from './discord/register-commands';
import { routeInteraction } from './interactions/router';

async function main() {
  logger.info(`Starting ${botEnv.DISCORD_BOT_PUBLIC_NAME} Discord Companion...`);

  // 1. Register application slash commands
  try {
    await registerSlashCommands(
      botEnv.DISCORD_TOKEN,
      botEnv.DISCORD_APPLICATION_ID,
      botEnv.DISCORD_DEV_GUILD_ID || undefined,
    );
  } catch (err) {
    logger.error('Failed to register slash commands during startup:', err);
  }

  // 2. Create Discord client
  const client = createBotClient();

  client.once('clientReady', () => {
    logger.info(`🤖 Bot is ready and logged in as ${client.user?.tag}!`);
  });

  // 3. Interaction handling
  client.on('interactionCreate', async (interaction) => {
    try {
      await routeInteraction(interaction);
    } catch (err) {
      logger.error('Unhandled interaction error:', err);
      const errorMsg = 'An unexpected error occurred while processing this request.';
      if (interaction.isRepliable()) {
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMsg, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMsg, ephemeral: true });
          }
        } catch {
          // Interaction token died or already acknowledged
        }
      }
    }
  });

  // 4. Connect to Gateway
  try {
    await client.login(botEnv.DISCORD_TOKEN);
  } catch (err) {
    logger.error('Failed to login to Discord Gateway:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal crash in main process:', err);
  process.exit(1);
});
