import {
  REST,
  Routes,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { logger } from '../logger';

export function getSlashCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const commands = [
    // 1. /link
    new SlashCommandBuilder()
      .setName('link')
      .setDescription('Link your ZedArchive account with this Discord user (DM only)')
      .addStringOption((opt) =>
        opt
          .setName('code')
          .setDescription('One-time link code generated on the website (e.g. ZA-AB3K-9MPQ)')
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(20),
      ),

    // 2. /unlink
    new SlashCommandBuilder()
      .setName('unlink')
      .setDescription('Disconnect your ZedArchive account from this Discord user'),

    // 3. /whoami
    new SlashCommandBuilder()
      .setName('whoami')
      .setDescription('Check the ZedArchive account linked to this Discord profile'),

    // 4. /add
    new SlashCommandBuilder()
      .setName('add')
      .setDescription('Search the catalog or enter a manual title to add to your archive')
      .addStringOption((opt) =>
        opt
          .setName('category')
          .setDescription('Type of media')
          .setRequired(true)
          .addChoices(
            { name: 'TV Show', value: 'show' },
            { name: 'Movie', value: 'movie' },
            { name: 'Book', value: 'book' },
            { name: 'Anime', value: 'anime' },
            { name: 'Manga', value: 'manga' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('query')
          .setDescription('Title to search for, or exact manual name')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(100),
      )
      .addStringOption((opt) =>
        opt
          .setName('source')
          .setDescription('Search online catalog or add as custom manual title')
          .setRequired(false)
          .addChoices(
            { name: 'Online Catalog (Default)', value: 'catalog' },
            { name: 'Manual Custom Title', value: 'manual' },
          ),
      ),

    // 5. /now
    new SlashCommandBuilder()
      .setName('now')
      .setDescription('View your recent in-progress titles and current progress'),

    // 6. /library
    new SlashCommandBuilder()
      .setName('library')
      .setDescription('Browse and filter your personal archive')
      .addStringOption((opt) =>
        opt
          .setName('status')
          .setDescription('Filter by shelf status')
          .setRequired(false)
          .addChoices(
            { name: 'In Progress', value: 'in_progress' },
            { name: 'Completed', value: 'completed' },
            { name: 'Planning', value: 'planning' },
            { name: 'On Hold', value: 'on_hold' },
            { name: 'Dropped', value: 'dropped' },
            { name: 'Any Status', value: 'any' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('category')
          .setDescription('Filter by media category')
          .setRequired(false)
          .addChoices(
            { name: 'TV Shows', value: 'show' },
            { name: 'Movies', value: 'movie' },
            { name: 'Books', value: 'book' },
            { name: 'Anime', value: 'anime' },
            { name: 'Manga', value: 'manga' },
            { name: 'Any Category', value: 'any' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('query')
          .setDescription('Search title by keyword')
          .setRequired(false)
          .setMaxLength(100),
      ),

    // 7. /title
    new SlashCommandBuilder()
      .setName('title')
      .setDescription('Inspect an archive title card and quick actions')
      .addStringOption((opt) =>
        opt
          .setName('title')
          .setDescription('Title from your archive')
          .setRequired(true)
          .setAutocomplete(true),
      ),

    // 8. /edit
    new SlashCommandBuilder()
      .setName('edit')
      .setDescription('Open the folio hub to log progress, change status, rate, or edit notes')
      .addStringOption((opt) =>
        opt
          .setName('title')
          .setDescription('Title from your archive')
          .setRequired(true)
          .setAutocomplete(true),
      ),

    // 9. /next
    new SlashCommandBuilder()
      .setName('next')
      .setDescription('Step progress +1 episode or chapter (+1 rewatch/watched for movies)')
      .addStringOption((opt) =>
        opt
          .setName('title')
          .setDescription('Title from your archive')
          .setRequired(true)
          .setAutocomplete(true),
      ),

    // 10. /status
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Move a title to a different shelf')
      .addStringOption((opt) =>
        opt
          .setName('title')
          .setDescription('Title from your archive')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('status')
          .setDescription('Target shelf status')
          .setRequired(true)
          .addChoices(
            { name: 'In Progress', value: 'in_progress' },
            { name: 'Completed', value: 'completed' },
            { name: 'Planning', value: 'planning' },
            { name: 'On Hold', value: 'on_hold' },
            { name: 'Dropped', value: 'dropped' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('reason')
          .setDescription('Optional reason if dropping (max 500 chars)')
          .setRequired(false)
          .setMaxLength(500),
      ),

    // 11. /complete
    new SlashCommandBuilder()
      .setName('complete')
      .setDescription('Mark a title as completed (status only; does not alter episode numbers)')
      .addStringOption((opt) =>
        opt
          .setName('title')
          .setDescription('Title from your archive')
          .setRequired(true)
          .setAutocomplete(true),
      ),

    // 12. /drop
    new SlashCommandBuilder()
      .setName('drop')
      .setDescription('Mark a title as dropped with an optional reason')
      .addStringOption((opt) =>
        opt
          .setName('title')
          .setDescription('Title from your archive')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('reason')
          .setDescription('Optional explanation or reason for dropping')
          .setRequired(false)
          .setMaxLength(500),
      ),

    // 13. /rate
    new SlashCommandBuilder()
      .setName('rate')
      .setDescription('Rate a title from 1 to 10')
      .addStringOption((opt) =>
        opt
          .setName('title')
          .setDescription('Title from your archive')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('score')
          .setDescription('Rating from 1 to 10')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10),
      ),

    // 14. /stats
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('View your overall ZedArchive statistics and completion metrics'),

    // 15. /streak
    new SlashCommandBuilder()
      .setName('streak')
      .setDescription('View your current daily media tracking streak'),

    // 16. /airing
    new SlashCommandBuilder()
      .setName('airing')
      .setDescription('Check upcoming broadcast air dates for your in-progress shows and anime'),

    // 17. /help
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Quick guide to ZedArchive Discord bot commands'),
  ];

  return commands.map((c) => c.toJSON());
}

export async function registerSlashCommands(
  token: string,
  applicationId: string,
  guildId?: string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const commands = getSlashCommands();

  try {
    if (guildId && guildId.trim()) {
      logger.info(`Registering ${commands.length} application commands to dev guild: ${guildId}`);
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId.trim()), {
        body: commands,
      });
      logger.info('Successfully registered guild slash commands.');
    } else {
      logger.info(`Registering ${commands.length} global application commands`);
      await rest.put(Routes.applicationCommands(applicationId), {
        body: commands,
      });
      logger.info('Successfully registered global slash commands.');
    }
  } catch (err) {
    logger.error('Failed to register application slash commands:', err);
    throw err;
  }
}
