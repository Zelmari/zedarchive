import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type Interaction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { handleLinkCommand } from '../commands/link';
import { handleUnlinkCommand } from '../commands/unlink';
import { handleWhoamiCommand } from '../commands/whoami';
import { handleNowCommand } from '../commands/now';
import { handleLibraryCommand, handleLibraryPageButton } from '../commands/library';
import { handleTitleCommand, buildTitleCard } from '../commands/title';
import { handleEditCommand, buildEditInspector } from '../commands/edit';
import { handleNextCommand, runNextStep } from '../commands/next';
import { handleStatusCommand } from '../commands/status';
import { handleCompleteCommand } from '../commands/complete';
import { handleDropCommand } from '../commands/drop';
import { handleRateCommand } from '../commands/rate';
import { handleStatsCommand } from '../commands/stats';
import { handleStreakCommand } from '../commands/streak';
import { handleAiringCommand } from '../commands/airing';
import { handleHelpCommand } from '../commands/help';
import { handleTitleAutocomplete } from './autocomplete';
import { requireLinkedUser } from '../auth/require-linked-user';
import { unlinkByDiscordUserId } from '@/domain/discord-link';
import {
  completeMediaEntryForUser,
  updateMediaProgressForUser,
  createMediaEntryForUser,
  findPersonalEntryBySourceId,
  type MediaRow,
} from '@/domain/media';
import { resolvePersonalTitle } from '../resolve/title';
import { getDraft, updateDraft, deleteDraft, createDraft, type MediaDraft } from '../drafts';
import { buildDraftInspector, catalogDraftFieldsFromHit } from '../commands/add';
import { getSearchHits } from '../search-cache';
import type { MediaCategory } from '@/types/media';
import { handleAddCommand } from '../commands/add';
import { botEnv } from '../env';
import { logger } from '../logger';
import { checkMutationRateLimit } from '../rate-limiter';
import {
  isMutatingButtonCustomId,
  isMutatingSelectCustomId,
  isMutatingModalCustomId,
} from './mutation-ids';
import { continuePendingPick } from '../resolve/continue-pick';

const MUTATION_COMMANDS = new Set(['next', 'complete', 'status', 'drop', 'rate']);

export async function routeInteraction(interaction: Interaction): Promise<void> {
  // 1. Autocomplete
  if (interaction.isAutocomplete()) {
    if (
      interaction.commandName === 'title' ||
      interaction.commandName === 'edit' ||
      interaction.commandName === 'next' ||
      interaction.commandName === 'status' ||
      interaction.commandName === 'complete' ||
      interaction.commandName === 'drop' ||
      interaction.commandName === 'rate'
    ) {
      await handleTitleAutocomplete(interaction);
    }
    return;
  }

  // 2. ChatInputCommand (Slash commands)
  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;

    if (MUTATION_COMMANDS.has(cmd)) {
      const check = checkMutationRateLimit(interaction.user.id);
      if (!check.allowed) {
        await interaction.reply({
          content: 'Too many updates. Wait a few seconds.',
          ephemeral: true,
        });
        return;
      }
    }
    switch (cmd) {
      case 'link':
        return handleLinkCommand(interaction);
      case 'unlink':
        return handleUnlinkCommand(interaction);
      case 'whoami':
        return handleWhoamiCommand(interaction);
      case 'add':
        return handleAddCommand(interaction);
      case 'now':
        return handleNowCommand(interaction);
      case 'library':
        return handleLibraryCommand(interaction);
      case 'title':
        return handleTitleCommand(interaction);
      case 'edit':
        return handleEditCommand(interaction);
      case 'next':
        return handleNextCommand(interaction);
      case 'status':
        return handleStatusCommand(interaction);
      case 'complete':
        return handleCompleteCommand(interaction);
      case 'drop':
        return handleDropCommand(interaction);
      case 'rate':
        return handleRateCommand(interaction);
      case 'stats':
        return handleStatsCommand(interaction);
      case 'streak':
        return handleStreakCommand(interaction);
      case 'airing':
        return handleAiringCommand(interaction);
      case 'help':
        return handleHelpCommand(interaction);
      default:
        logger.warn(`Unknown command: ${cmd}`);
    }
    return;
  }

  // 3. Button Interactions
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
    return;
  }

  // 4. StringSelectMenu Interactions
  if (interaction.isStringSelectMenu()) {
    await handleSelectMenuInteraction(interaction);
    return;
  }

  // 5. ModalSubmit Interactions
  if (interaction.isModalSubmit()) {
    await handleModalSubmitInteraction(interaction);
    return;
  }
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (isMutatingButtonCustomId(customId)) {
    const check = checkMutationRateLimit(interaction.user.id);
    if (!check.allowed) {
      await interaction.reply({
        content: 'Too many updates. Wait a few seconds.',
        ephemeral: true,
      });
      return;
    }
  }

  if (customId.startsWith('za:lib:')) {
    return handleLibraryPageButton(interaction);
  }

  // Unlink confirmation buttons
  if (customId.startsWith('za:auth:unlink_confirm:')) {
    await unlinkByDiscordUserId(interaction.user.id);
    await interaction.update({
      content: '✅ Your Discord profile has been disconnected from ZedArchive.',
      components: [],
    });
    return;
  }

  if (customId.startsWith('za:auth:unlink_cancel:')) {
    await interaction.update({
      content: 'Unlink cancelled.',
      components: [],
    });
    return;
  }

  // Title Card buttons
  if (customId.startsWith('za:title:')) {
    const parts = customId.split(':');
    const mediaId = parts[2];
    const action = parts[3];

    const user = await requireLinkedUser(interaction);
    if (!user || !mediaId) return;

    const resolved = await resolvePersonalTitle(user.userId, mediaId);
    if (resolved.notFound || !resolved.entry) {
      await interaction.reply({ content: 'Entry not found.', ephemeral: true });
      return;
    }

    const entry = resolved.entry;

    if (action === 'step') {
      await interaction.deferUpdate();
      const { updated } = await runNextStep(user.userId, entry);
      const { embed, row } = buildTitleCard(updated);
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    if (action === 'complete') {
      await interaction.deferUpdate();
      const updated = await completeMediaEntryForUser(user.userId, entry.id);
      const { embed, row } = buildTitleCard(updated as any);
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    if (action === 'edit') {
      await interaction.deferUpdate();
      const { embed, components } = buildEditInspector(entry);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }
  }

  // Edit Folio buttons
  if (customId.startsWith('za:edit:')) {
    const parts = customId.split(':');
    const mediaId = parts[2];
    const action = parts[3];

    const user = await requireLinkedUser(interaction);
    if (!user || !mediaId) return;

    const resolved = await resolvePersonalTitle(user.userId, mediaId);
    if (resolved.notFound || !resolved.entry) {
      await interaction.reply({ content: 'Entry not found.', ephemeral: true });
      return;
    }

    const entry = resolved.entry;

    if (action === 'complete') {
      await interaction.deferUpdate();
      const updated = await completeMediaEntryForUser(user.userId, entry.id);
      const { embed, components } = buildEditInspector(updated as any);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    if (action === 'modal_progress') {
      // Must NOT defer before showing modal
      const modal = createProgressModal(entry);
      await interaction.showModal(modal);
      return;
    }

    if (action === 'modal_notes') {
      // Must NOT defer before showing modal
      const modal = new ModalBuilder()
        .setCustomId(`za:edit_modal_notes:${entry.id}`)
        .setTitle(`Notes: ${entry.title.slice(0, 30)}`);

      const notesInput = new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Personal Notes')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(entry.notes || '')
        .setMaxLength(1000)
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput));
      await interaction.showModal(modal);
      return;
    }
  }

  // Add flow buttons
  if (customId.startsWith('za:add:')) {
    const parts = customId.split(':');
    const actionOrId = parts[2];

    // Manual custom title button from search
    if (actionOrId === 'custom') {
      const encodedQuery = parts[3] || '';
      const category = parts[4] || 'show';
      const query = decodeURIComponent(encodedQuery);

      const user = await requireLinkedUser(interaction);
      if (!user) return;

      const isMovie = category === 'movie';
      const draft = createDraft({
        userId: user.userId,
        discordUserId: interaction.user.id,
        title: query,
        category: category as any,
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

      const { embed, components } = buildDraftInspector(draft);
      await interaction.update({
        content: null,
        embeds: [embed],
        components,
      });
      return;
    }

    const draftId = actionOrId;
    const action = parts[3];

    const draft = getDraft(draftId || '');
    if (!draft) {
      await interaction.reply({
        content: 'That add draft expired. Run `/add` again.',
        ephemeral: true,
      });
      return;
    }

    if (action === 'cancel') {
      deleteDraft(draft.draftId);
      await interaction.update({
        content: `Add cancelled for **${draft.title}**.`,
        embeds: [],
        components: [],
      });
      return;
    }

    if (action === 'submit') {
      await interaction.deferUpdate();

      try {
        const created = await createMediaEntryForUser(draft.userId, {
          title: draft.title,
          category: draft.category,
          status: draft.status,
          rating: draft.rating,
          sourceId: draft.sourceId,
          structure: draft.structure,
          primaryUnitCurrent: draft.primaryUnitCurrent,
          primaryUnitTotal: draft.primaryUnitTotal,
          secondaryUnitCurrent: draft.secondaryUnitCurrent,
          secondaryUnitTotal: draft.secondaryUnitTotal,
          coverImage: draft.coverUrl,
          notes: draft.notes,
          dropReason: draft.dropReason,
        });

        deleteDraft(draft.draftId);

        await interaction.editReply({
          content: `Added **${created.title}** to your archive.\n\nView on web: ${botEnv.APP_URL}/dashboard`,
          embeds: [],
          components: [],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save entry';
        await interaction.followUp({ content: message, ephemeral: true });
      }
      return;
    }

    if (action === 'modal_details') {
      // Must NOT defer before showing modal
      const modal = createDraftDetailsModal(draft);
      await interaction.showModal(modal);
      return;
    }
  }
}

async function handleSelectMenuInteraction(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('za:pick:')) {
    const pendingId = customId.split(':')[2];
    if (!pendingId) return;
    return continuePendingPick(interaction, pendingId);
  }

  if (isMutatingSelectCustomId(customId)) {
    const check = checkMutationRateLimit(interaction.user.id);
    if (!check.allowed) {
      await interaction.reply({
        content: 'Too many updates. Wait a few seconds.',
        ephemeral: true,
      });
      return;
    }
  }

  // Catalog hit picked during /add
  if (customId.startsWith('za:add:catalog_pick:')) {
    const user = await requireLinkedUser(interaction);
    if (!user) return;

    await interaction.deferUpdate();

    const parts = customId.split(':');
    const category = parts[3] as MediaCategory;
    const cacheId = parts[4];

    const cache = cacheId ? getSearchHits(cacheId) : null;
    if (!cache || cache.discordUserId !== interaction.user.id) {
      await interaction.editReply({
        content: 'That add draft expired. Run `/add` again.',
        embeds: [],
        components: [],
      });
      return;
    }

    const selectedIndex = parseInt(interaction.values[0] || '0', 10);
    const hit = cache.hits[selectedIndex];
    if (!hit) {
      await interaction.editReply({
        content: 'That add draft expired. Run `/add` again.',
        embeds: [],
        components: [],
      });
      return;
    }

    if (hit.sourceId) {
      const existing = await findPersonalEntryBySourceId(user.userId, hit.sourceId);
      if (existing) {
        await interaction.editReply({
          content: 'Already in your archive. Try `/title`.',
          embeds: [],
          components: [],
        });
        return;
      }
    }

    const draft = createDraft({
      ...catalogDraftFieldsFromHit(hit, cache.category || category),
      userId: user.userId,
      discordUserId: interaction.user.id,
    });

    const { embed, components } = buildDraftInspector(draft);
    await interaction.editReply({
      content: null,
      embeds: [embed],
      components,
    });
    return;
  }

  // Draft status select
  if (customId.startsWith('za:add:') && customId.endsWith(':select_status')) {
    const draftId = customId.split(':')[2];
    const draft = getDraft(draftId || '');
    if (!draft) {
      await interaction.reply({ content: 'Draft expired.', ephemeral: true });
      return;
    }

    const newStatus = interaction.values[0] || 'in_progress';
    if (newStatus === 'dropped') {
      await interaction.showModal(createAddDropModal(draft));
      return;
    }

    const updated = updateDraft(draft.draftId, { status: newStatus });
    if (updated) {
      const { embed, components } = buildDraftInspector(updated);
      await interaction.update({ embeds: [embed], components });
    }
    return;
  }

  // Draft rate select
  if (customId.startsWith('za:add:') && customId.endsWith(':select_rate')) {
    const draftId = customId.split(':')[2];
    const draft = getDraft(draftId || '');
    if (!draft) {
      await interaction.reply({ content: 'Draft expired.', ephemeral: true });
      return;
    }

    const val = parseInt(interaction.values[0] || '0', 10);
    const newRating = val > 0 ? val : null;
    const updated = updateDraft(draft.draftId, { rating: newRating });
    if (updated) {
      const { embed, components } = buildDraftInspector(updated);
      await interaction.update({ embeds: [embed], components });
    }
    return;
  }

  // Edit Folio status select
  if (customId.startsWith('za:edit:') && customId.endsWith(':select_status')) {
    const mediaId = customId.split(':')[2];
    const user = await requireLinkedUser(interaction);
    if (!user || !mediaId) return;

    const newStatus = interaction.values[0] || 'in_progress';
    if (newStatus === 'dropped') {
      const resolved = await resolvePersonalTitle(user.userId, mediaId);
      const title = resolved.entry?.title ?? 'Title';
      await interaction.showModal(createEditDropModal(mediaId, title));
      return;
    }

    const statusLimit = checkMutationRateLimit(interaction.user.id);
    if (!statusLimit.allowed) {
      await interaction.reply({
        content: 'Too many updates. Wait a few seconds.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();
    const updated = await updateMediaProgressForUser(user.userId, mediaId, {
      status: newStatus,
    });

    const { embed, components } = buildEditInspector(updated as any);
    await interaction.editReply({ embeds: [embed], components });
    return;
  }

  // Edit Folio rate select
  if (customId.startsWith('za:edit:') && customId.endsWith(':select_rate')) {
    const mediaId = customId.split(':')[2];
    const user = await requireLinkedUser(interaction);
    if (!user || !mediaId) return;

    await interaction.deferUpdate();
    const val = parseInt(interaction.values[0] || '0', 10);
    const newRating = val > 0 ? val : null;
    const updated = await updateMediaProgressForUser(user.userId, mediaId, {
      rating: newRating,
    });

    const { embed, components } = buildEditInspector(updated as any);
    await interaction.editReply({ embeds: [embed], components });
    return;
  }
}

async function handleModalSubmitInteraction(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;

  if (isMutatingModalCustomId(customId)) {
    const check = checkMutationRateLimit(interaction.user.id);
    if (!check.allowed) {
      await interaction.reply({
        content: 'Too many updates. Wait a few seconds.',
        ephemeral: true,
      });
      return;
    }
  }

  // Edit Progress modal submit
  if (customId.startsWith('za:edit_modal_progress:')) {
    const mediaId = customId.split(':')[2];
    const user = await requireLinkedUser(interaction);
    if (!user || !mediaId) return;

    await interaction.deferUpdate();

    const resolved = await resolvePersonalTitle(user.userId, mediaId);
    if (resolved.notFound || !resolved.entry) {
      await interaction.followUp({ content: 'Entry not found.', ephemeral: true });
      return;
    }

    const entry = resolved.entry;
    const updates: Record<string, unknown> = {};

    // Validate numeric inputs carefully with /^\d+$/
    const parseNumberOrOmit = (fieldId: string): number | undefined => {
      try {
        const val = interaction.fields.getTextInputValue(fieldId).trim();
        if (/^\d+$/.test(val)) {
          return parseInt(val, 10);
        }
      } catch {
        // field not in modal
      }
      return undefined;
    };

    if (entry.category === 'movie') {
      const cur = parseNumberOrOmit('secondaryUnitCurrent');
      const tot = parseNumberOrOmit('secondaryUnitTotal');
      if (cur !== undefined) updates.secondaryUnitCurrent = cur;
      if (tot !== undefined) updates.secondaryUnitTotal = tot;
    } else {
      const pCur = parseNumberOrOmit('primaryUnitCurrent');
      const pTot = parseNumberOrOmit('primaryUnitTotal');
      const sCur = parseNumberOrOmit('secondaryUnitCurrent');
      const sTot = parseNumberOrOmit('secondaryUnitTotal');

      if (pCur !== undefined) updates.primaryUnitCurrent = pCur;
      if (pTot !== undefined) updates.primaryUnitTotal = pTot;
      if (sCur !== undefined) updates.secondaryUnitCurrent = sCur;
      if (sTot !== undefined) updates.secondaryUnitTotal = sTot;
    }

    const updated = await updateMediaProgressForUser(user.userId, mediaId, updates);
    const { embed, components } = buildEditInspector(updated as any);
    await interaction.editReply({ embeds: [embed], components });
    return;
  }

  // Edit Notes modal submit
  if (customId.startsWith('za:edit_modal_notes:')) {
    const mediaId = customId.split(':')[2];
    const user = await requireLinkedUser(interaction);
    if (!user || !mediaId) return;

    await interaction.deferUpdate();
    const notes = interaction.fields.getTextInputValue('notes').trim();

    const updated = await updateMediaProgressForUser(user.userId, mediaId, {
      notes: notes || null,
    });

    const { embed, components } = buildEditInspector(updated as any);
    await interaction.editReply({ embeds: [embed], components });
    return;
  }

  // Edit drop reason modal submit
  if (customId.startsWith('za:edit_modal_drop:')) {
    const mediaId = customId.split(':')[2];
    const user = await requireLinkedUser(interaction);
    if (!user || !mediaId) return;

    await interaction.deferUpdate();

    let dropReason: string | null = null;
    try {
      const reason = interaction.fields.getTextInputValue('dropReason').trim();
      if (reason) dropReason = reason;
    } catch {}

    const updated = await updateMediaProgressForUser(user.userId, mediaId, {
      status: 'dropped',
      dropReason,
    });

    const { embed, components } = buildEditInspector(updated as any);
    await interaction.editReply({ embeds: [embed], components });
    return;
  }

  // Add draft drop reason modal submit
  if (customId.startsWith('za:add_modal_drop:')) {
    const draftId = customId.split(':')[2];
    const draft = getDraft(draftId || '');
    if (!draft) {
      await interaction.reply({ content: 'Draft expired.', ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    let dropReason: string | null = null;
    try {
      const reason = interaction.fields.getTextInputValue('dropReason').trim();
      if (reason) dropReason = reason;
    } catch {}

    const updated = updateDraft(draft.draftId, {
      status: 'dropped',
      dropReason,
    });

    if (updated) {
      const { embed, components } = buildDraftInspector(updated);
      await interaction.editReply({ embeds: [embed], components });
    }
    return;
  }

  // Add Draft Details modal submit
  if (customId.startsWith('za:add_modal_details:')) {
    const draftId = customId.split(':')[2];
    const draft = getDraft(draftId || '');
    if (!draft) {
      await interaction.reply({ content: 'Draft expired.', ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    const parseNumber = (fieldId: string, fallback: number | null): number | null => {
      try {
        const val = interaction.fields.getTextInputValue(fieldId).trim();
        if (/^\d+$/.test(val)) return parseInt(val, 10);
      } catch {}
      return fallback;
    };

    let title = draft.title;
    try {
      const newTitle = interaction.fields.getTextInputValue('title').trim();
      if (newTitle) title = newTitle;
    } catch {}

    const updates: Partial<MediaDraft> = { title };

    if (draft.category === 'movie') {
      updates.secondaryUnitCurrent =
        parseNumber('secondaryUnitCurrent', draft.secondaryUnitCurrent) ?? 0;
      updates.secondaryUnitTotal = parseNumber('secondaryUnitTotal', draft.secondaryUnitTotal);
    } else {
      updates.primaryUnitCurrent = parseNumber('primaryUnitCurrent', draft.primaryUnitCurrent) ?? 1;
      updates.primaryUnitTotal = parseNumber('primaryUnitTotal', draft.primaryUnitTotal);
      updates.secondaryUnitCurrent =
        parseNumber('secondaryUnitCurrent', draft.secondaryUnitCurrent) ?? 0;
      updates.secondaryUnitTotal = parseNumber('secondaryUnitTotal', draft.secondaryUnitTotal);
    }

    const updated = updateDraft(draft.draftId, updates);
    if (updated) {
      const { embed, components } = buildDraftInspector(updated);
      await interaction.editReply({ embeds: [embed], components });
    }
  }
}

function createProgressModal(entry: MediaRow): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`za:edit_modal_progress:${entry.id}`)
    .setTitle(`Progress: ${entry.title.slice(0, 30)}`);

  if (entry.category === 'movie') {
    const currentInput = new TextInputBuilder()
      .setCustomId('secondaryUnitCurrent')
      .setLabel('Minutes Watched')
      .setStyle(TextInputStyle.Short)
      .setValue(String(entry.secondaryUnitCurrent || 0))
      .setRequired(true);

    const totalInput = new TextInputBuilder()
      .setCustomId('secondaryUnitTotal')
      .setLabel('Runtime (Minutes)')
      .setStyle(TextInputStyle.Short)
      .setValue(entry.secondaryUnitTotal ? String(entry.secondaryUnitTotal) : '')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(currentInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(totalInput),
    );
  } else {
    const isBookish = entry.category === 'book' || entry.category === 'manga';

    const pCur = new TextInputBuilder()
      .setCustomId('primaryUnitCurrent')
      .setLabel(isBookish ? 'Current Volume' : 'Current Season')
      .setStyle(TextInputStyle.Short)
      .setValue(String(entry.primaryUnitCurrent || 1))
      .setRequired(true);

    const sCur = new TextInputBuilder()
      .setCustomId('secondaryUnitCurrent')
      .setLabel(isBookish ? 'Current Chapter / Page' : 'Current Episode')
      .setStyle(TextInputStyle.Short)
      .setValue(String(entry.secondaryUnitCurrent || 0))
      .setRequired(true);

    const pTot = new TextInputBuilder()
      .setCustomId('primaryUnitTotal')
      .setLabel(isBookish ? 'Total Volumes' : 'Total Seasons')
      .setStyle(TextInputStyle.Short)
      .setValue(entry.primaryUnitTotal ? String(entry.primaryUnitTotal) : '')
      .setRequired(false);

    const sTot = new TextInputBuilder()
      .setCustomId('secondaryUnitTotal')
      .setLabel(isBookish ? 'Total Chapters / Pages' : 'Episodes in Season')
      .setStyle(TextInputStyle.Short)
      .setValue(entry.secondaryUnitTotal ? String(entry.secondaryUnitTotal) : '')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(pCur),
      new ActionRowBuilder<TextInputBuilder>().addComponents(sCur),
      new ActionRowBuilder<TextInputBuilder>().addComponents(pTot),
      new ActionRowBuilder<TextInputBuilder>().addComponents(sTot),
    );
  }

  return modal;
}

function createDraftDetailsModal(draft: MediaDraft): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`za:add_modal_details:${draft.draftId}`)
    .setTitle('Edit Title Draft Details');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setValue(draft.title)
    .setMaxLength(100)
    .setRequired(true);

  if (draft.category === 'movie') {
    const runtimeInput = new TextInputBuilder()
      .setCustomId('secondaryUnitTotal')
      .setLabel('Runtime (Minutes)')
      .setStyle(TextInputStyle.Short)
      .setValue(draft.secondaryUnitTotal ? String(draft.secondaryUnitTotal) : '')
      .setRequired(false);

    const watchedInput = new TextInputBuilder()
      .setCustomId('secondaryUnitCurrent')
      .setLabel('Minutes Watched')
      .setStyle(TextInputStyle.Short)
      .setValue(String(draft.secondaryUnitCurrent || 0))
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(runtimeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(watchedInput),
    );
  } else {
    const isBookish = draft.category === 'book' || draft.category === 'manga';

    const pCur = new TextInputBuilder()
      .setCustomId('primaryUnitCurrent')
      .setLabel(isBookish ? 'Current Volume' : 'Current Season')
      .setStyle(TextInputStyle.Short)
      .setValue(String(draft.primaryUnitCurrent || 1))
      .setRequired(true);

    const sCur = new TextInputBuilder()
      .setCustomId('secondaryUnitCurrent')
      .setLabel(isBookish ? 'Current Chapter / Page' : 'Current Episode')
      .setStyle(TextInputStyle.Short)
      .setValue(String(draft.secondaryUnitCurrent || 0))
      .setRequired(true);

    const pTot = new TextInputBuilder()
      .setCustomId('primaryUnitTotal')
      .setLabel(isBookish ? 'Total Volumes' : 'Total Seasons')
      .setStyle(TextInputStyle.Short)
      .setValue(draft.primaryUnitTotal ? String(draft.primaryUnitTotal) : '')
      .setRequired(false);

    const sTot = new TextInputBuilder()
      .setCustomId('secondaryUnitTotal')
      .setLabel(isBookish ? 'Total Chapters / Pages' : 'Episodes in Season')
      .setStyle(TextInputStyle.Short)
      .setValue(draft.secondaryUnitTotal ? String(draft.secondaryUnitTotal) : '')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(pCur),
      new ActionRowBuilder<TextInputBuilder>().addComponents(sCur),
      new ActionRowBuilder<TextInputBuilder>().addComponents(pTot),
      new ActionRowBuilder<TextInputBuilder>().addComponents(sTot),
    );
  }

  return modal;
}

function createEditDropModal(mediaId: string, title: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`za:edit_modal_drop:${mediaId}`)
    .setTitle(`Drop: ${title.slice(0, 30)}`);

  const reasonInput = new TextInputBuilder()
    .setCustomId('dropReason')
    .setLabel('Reason (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  return modal;
}

function createAddDropModal(draft: MediaDraft): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`za:add_modal_drop:${draft.draftId}`)
    .setTitle(`Drop: ${draft.title.slice(0, 30)}`);

  const reasonInput = new TextInputBuilder()
    .setCustomId('dropReason')
    .setLabel('Reason (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  return modal;
}
