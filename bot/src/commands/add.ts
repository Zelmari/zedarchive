import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type AttachmentBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { botEnv } from '../env';
import { createDraft, type MediaDraft } from '../drafts';
import { stashSearchHits } from '../search-cache';
import { coverToDiscordMedia } from '../format/cover-attachment';
import { coverReplyOptions } from '../format/reply-cover';
import { createBaseEmbed } from '../format/embeds';
import { formatProgressString } from '../format/progress';
import { formatShelf, formatCategory } from '../format/labels';
import { endpointFor } from '@/lib/search';
import type { SearchResult } from '@/types/search';
import type { MediaCategory } from '@/types/media';

export function buildDraftInspector(draft: MediaDraft): {
  embed: ReturnType<typeof createBaseEmbed>;
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
  files: AttachmentBuilder[];
} {
  const progressStr = formatProgressString(draft);
  const statusLabel = formatShelf(draft.status);

  const embed = createBaseEmbed(`New Title Draft: ${draft.title}`)
    .setDescription(
      'Review your draft before saving. You can adjust season/chapter numbers, set a status, or rate it before committing to your archive.',
    )
    .addFields(
      { name: 'Category', value: formatCategory(draft.category), inline: true },
      {
        name: 'Source',
        value: draft.sourceId ? `Catalog (\`${draft.sourceId}\`)` : 'Manual Title',
        inline: true,
      },
      { name: 'Initial Shelf', value: statusLabel, inline: true },
      { name: 'Initial Progress', value: `\`${progressStr}\``, inline: true },
    );

  if (draft.rating) {
    embed.addFields({ name: 'Rating', value: `★ ${draft.rating}/10`, inline: true });
  }

  const cover = coverToDiscordMedia(draft.coverUrl);
  if (cover.thumbnailUrl) embed.setThumbnail(cover.thumbnailUrl);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`za:add:${draft.draftId}:modal_details`)
      .setLabel('Edit Details')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`za:add:${draft.draftId}:submit`)
      .setLabel('Save to Archive')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`za:add:${draft.draftId}:cancel`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  const statusRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`za:add:${draft.draftId}:select_status`)
      .setPlaceholder(`Shelf: ${statusLabel}`)
      .addOptions([
        { label: 'In Progress', value: 'in_progress', default: draft.status === 'in_progress' },
        { label: 'Completed', value: 'completed', default: draft.status === 'completed' },
        { label: 'Planning', value: 'planning', default: draft.status === 'planning' },
        { label: 'On Hold', value: 'on_hold', default: draft.status === 'on_hold' },
        { label: 'Dropped', value: 'dropped', default: draft.status === 'dropped' },
      ]),
  );

  const rateOptions = [
    { label: 'No Rating', value: '0' },
    ...Array.from({ length: 10 }, (_, i) => ({
      label: `★ ${i + 1}/10`,
      value: String(i + 1),
      default: draft.rating === i + 1,
    })),
  ];

  const rateRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`za:add:${draft.draftId}:select_rate`)
      .setPlaceholder(
        draft.rating ? `Rating: ★ ${draft.rating}/10` : 'Set Initial Rating (Optional)',
      )
      .addOptions(rateOptions),
  );

  return { embed, components: [buttonRow, statusRow, rateRow], files: cover.files };
}

export async function handleAddCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const category = interaction.options.getString('category', true) as MediaCategory;
  const query = interaction.options.getString('query', true).trim();
  const source = interaction.options.getString('source') || 'catalog';

  // Manual creation path
  if (source === 'manual') {
    const isMovie = category === 'movie';
    const draft = createDraft({
      userId: user.userId,
      discordUserId: interaction.user.id,
      title: query,
      category,
      sourceId: null,
      structure: [],
      primaryUnitCurrent: isMovie ? 0 : 1,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: null,
      status: 'in_progress',
      rating: null,
      coverUrl: null,
      notes: null,
    });

    const { embed, components, files } = buildDraftInspector(draft);
    await interaction.reply(
      coverReplyOptions({
        embeds: [embed],
        components,
        files,
        ephemeral: true,
      }),
    );
    return;
  }

  // Catalog search path
  await interaction.deferReply({ ephemeral: true });

  const searchPath = endpointFor(category, query);
  const searchUrl = `${botEnv.APP_URL}${searchPath}`;

  let results: SearchResult[] = [];
  try {
    const res = await fetch(searchUrl, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      results = Array.isArray(data.results) ? data.results : [];
    }
  } catch (err) {
    // Search failed
  }

  // If no results, offer manual custom title button
  if (results.length === 0) {
    const manualBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`za:add:custom:${encodeURIComponent(query)}:${category}`)
        .setLabel(`Add "${query.slice(0, 30)}" as a custom title`)
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({
      content: `No catalog results found for "${query}". You can add it as a manual title instead:`,
      components: [manualBtn],
    });
    return;
  }

  // Filter hits to max 25
  const topHits = results.slice(0, 25);

  const { cacheId } = stashSearchHits(interaction.user.id, category, topHits);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`za:add:catalog_pick:${category}:${cacheId}`)
    .setPlaceholder('Select a catalog match to configure draft...');

  for (let i = 0; i < topHits.length; i++) {
    const hit = topHits[i]!;
    const yearStr = hit.year ? ` (${hit.year})` : '';
    const authorStr = hit.authors ? ` by ${hit.authors}` : '';
    const description = `${hit.category}${yearStr}${authorStr}`.slice(0, 100);
    selectMenu.addOptions({
      label: hit.title.slice(0, 100),
      description: description || undefined,
      value: String(i),
    });
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  const manualRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`za:add:custom:${encodeURIComponent(query)}:${category}`)
      .setLabel(`Use "${query.slice(0, 30)}" as custom title instead`)
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content: `Found **${results.length}** catalog matches for "${query}". Select one below to configure your draft:`,
    components: [row, manualRow],
  });
}
