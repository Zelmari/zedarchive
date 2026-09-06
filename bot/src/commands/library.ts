import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { listPersonalLibraryLite, type MediaLiteEntry } from '@/domain/media';
import { folioEditReplyOptions, folioPlainEditReplyOptions } from '../format/reply-cover';
import {
  buildListFolio,
  formatLibraryLine,
  type FolioActionRow,
  type FolioMessage,
} from '../format/folio';
import { formatShelf } from '../format/labels';
import {
  createLibraryPageQuery,
  getLibraryPageQuery,
  LIBRARY_PAGE_SIZE,
  LIBRARY_EXPIRED_COPY,
  type LibraryPageQuery,
} from '../library/pending-page';

export function buildLibraryPageFolio(
  entries: MediaLiteEntry[],
  page: number,
  query: Pick<LibraryPageQuery, 'status' | 'category' | 'query'>,
  hasNextPage: boolean,
  actions: FolioActionRow[],
): FolioMessage {
  const heading =
    query.status === 'any' ? 'Personal Archive' : `Archive — ${formatShelf(query.status)}`;
  const startIndex = page * LIBRARY_PAGE_SIZE;
  const includeShelf = query.status === 'any';
  const lines = entries.map((entry, index) =>
    formatLibraryLine(entry, {
      includeShelf,
      index: startIndex + index + 1,
    }),
  );

  return buildListFolio({
    heading,
    footer: `Page ${page + 1}${hasNextPage ? '+' : ''} · ${LIBRARY_PAGE_SIZE} per page`,
    lines,
    actions,
  });
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
): Promise<FolioMessage | null> {
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
  if (pageEntries.length === 0) return null;

  const components = buildLibraryPageComponents(cacheId, page, page > 0, hasNextPage);
  return buildLibraryPageFolio(pageEntries, page, pageQuery, hasNextPage, components);
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

  const folio = await renderLibraryPage(pageQuery, 0, cacheId);

  if (!folio) {
    await interaction.editReply({
      content: 'No matching titles found in your personal archive.',
      components: [],
    });
    return;
  }

  await interaction.editReply(folioEditReplyOptions(folio));
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

  const folio = await renderLibraryPage(pageQuery, page, cacheId);

  if (!folio) {
    await interaction.editReply(folioPlainEditReplyOptions('No matching titles on this page.'));
    return;
  }

  await interaction.editReply(folioEditReplyOptions(folio));
}
