import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { listPersonalLibraryLite, type MediaLiteEntry } from '@/domain/media';
import { createBaseEmbed } from '../format/embeds';
import { formatProgressString } from '../format/progress';
import { formatShelf, formatCategory } from '../format/labels';
import {
  createLibraryPageQuery,
  getLibraryPageQuery,
  LIBRARY_PAGE_SIZE,
  LIBRARY_EXPIRED_COPY,
  type LibraryPageQuery,
} from '../library/pending-page';

export function buildLibraryPageEmbed(
  entries: MediaLiteEntry[],
  page: number,
  query: Pick<LibraryPageQuery, 'status' | 'category' | 'query'>,
  hasNextPage: boolean,
): ReturnType<typeof createBaseEmbed> {
  const titleHeader =
    query.status === 'any' ? 'Personal Archive' : `Archive — ${formatShelf(query.status)}`;
  const embed = createBaseEmbed(titleHeader);

  const startIndex = page * LIBRARY_PAGE_SIZE;
  const lines = entries.map((e, index) => {
    const progress = formatProgressString(e);
    const ratingPart = e.rating ? ` • ★ ${e.rating}` : '';
    const statusBadge = query.status === 'any' ? ` [${formatShelf(e.status)}]` : '';
    return (
      `**${startIndex + index + 1}. ${e.title}** (${formatCategory(e.category)})${statusBadge}\n` +
      `└ \`${progress}\`${ratingPart}`
    );
  });

  embed.setDescription(lines.join('\n\n'));
  embed.setFooter({
    text: `ZedArchive • Page ${page + 1}${hasNextPage ? '+' : ''} • ${LIBRARY_PAGE_SIZE} per page`,
  });

  return embed;
}

export function buildLibraryPageComponents(
  cacheId: string,
  page: number,
  hasPrevPage: boolean,
  hasNextPage: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`za:lib:${cacheId}:${page - 1}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasPrevPage),
      new ButtonBuilder()
        .setCustomId(`za:lib:${cacheId}:${page + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasNextPage),
    ),
  ];
}

export async function renderLibraryPage(
  pageQuery: LibraryPageQuery,
  page: number,
  cacheId: string,
): Promise<{
  embed: ReturnType<typeof createBaseEmbed>;
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const offset = page * LIBRARY_PAGE_SIZE;
  const entries = await listPersonalLibraryLite(pageQuery.userId, {
    status: pageQuery.status,
    category: pageQuery.category,
    query: pageQuery.query,
    limit: LIBRARY_PAGE_SIZE + 1,
    offset,
  });

  const hasNextPage = entries.length > LIBRARY_PAGE_SIZE;
  const pageEntries = hasNextPage ? entries.slice(0, LIBRARY_PAGE_SIZE) : entries;

  const embed = buildLibraryPageEmbed(pageEntries, page, pageQuery, hasNextPage);
  const components = buildLibraryPageComponents(cacheId, page, page > 0, hasNextPage);

  return { embed, components };
}

export async function handleLibraryCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const status = interaction.options.getString('status') || 'in_progress';
  const categoryOpt = interaction.options.getString('category');
  const category = categoryOpt && categoryOpt !== 'any' ? categoryOpt : undefined;
  const queryOpt = interaction.options.getString('query');
  const query = queryOpt?.trim() || undefined;

  await interaction.deferReply({ ephemeral: true });

  const { cacheId, query: pageQuery } = createLibraryPageQuery({
    discordUserId: interaction.user.id,
    userId: user.userId,
    status,
    category,
    query,
  });

  const { embed, components } = await renderLibraryPage(pageQuery, 0, cacheId);

  if (!embed.data.description) {
    await interaction.editReply({
      content: 'No matching titles found in your personal archive.',
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.editReply({ embeds: [embed], components });
}

export async function handleLibraryPageButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const cacheId = parts[2];
  const page = parseInt(parts[3] || '0', 10);

  if (!cacheId || Number.isNaN(page) || page < 0) {
    await interaction.reply({ content: LIBRARY_EXPIRED_COPY, ephemeral: true });
    return;
  }

  const pageQuery = getLibraryPageQuery(cacheId);
  if (!pageQuery) {
    await interaction.reply({ content: LIBRARY_EXPIRED_COPY, ephemeral: true });
    return;
  }

  if (pageQuery.discordUserId !== interaction.user.id) {
    await interaction.reply({
      content: 'That library view belongs to another user.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const { embed, components } = await renderLibraryPage(pageQuery, page, cacheId);

  if (!embed.data.description) {
    await interaction.editReply({
      content: 'No matching titles on this page.',
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.editReply({ embeds: [embed], components });
}
