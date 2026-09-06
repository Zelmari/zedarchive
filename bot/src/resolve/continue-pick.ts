import type { StringSelectMenuInteraction } from 'discord.js';
import { resolvePersonalTitle } from './title';
import {
  getPendingPick,
  deletePendingPick,
  editReplyForPickContinuation,
  PICK_EXPIRED_COPY,
} from './pending-pick';
import { buildTitleCard } from '../commands/title';
import { buildEditInspector } from '../commands/edit';
import { folioEditReplyOptions } from '../format/reply-cover';
import { runNextStep, formatNextStepMessage } from '../commands/next';
import { runCompleteStep, formatCompleteStepMessage } from '../commands/complete';
import { runDropStep, formatDropStepMessage } from '../commands/drop';
import { runRateStep, formatRateStepMessage } from '../commands/rate';
import { runStatusStep, formatStatusStepMessage } from '../commands/status';
import { TITLE_NOT_FOUND } from '../format/labels';
import { checkMutationRateLimit } from '../rate-limiter';

const WRITE_PICK_COMMANDS = new Set(['next', 'complete', 'drop', 'rate', 'status']);

export async function continuePendingPick(
  interaction: StringSelectMenuInteraction,
  pendingId: string,
): Promise<void> {
  const pick = getPendingPick(pendingId);
  if (!pick) {
    await interaction.reply({ content: PICK_EXPIRED_COPY, ephemeral: true });
    return;
  }

  if (pick.discordUserId !== interaction.user.id) {
    await interaction.reply({ content: 'That picker belongs to another user.', ephemeral: true });
    return;
  }

  const entryId = interaction.values[0];
  if (!entryId) {
    await interaction.reply({ content: TITLE_NOT_FOUND, ephemeral: true });
    return;
  }

  if (WRITE_PICK_COMMANDS.has(pick.command)) {
    const check = checkMutationRateLimit(interaction.user.id);
    if (!check.allowed) {
      await interaction.reply({
        content: 'Too many updates. Wait a few seconds.',
        ephemeral: true,
      });
      return;
    }
  }

  await interaction.deferUpdate();

  const resolved = await resolvePersonalTitle(pick.userId, entryId);
  if (resolved.notFound || !resolved.entry) {
    await editReplyForPickContinuation(interaction, { content: TITLE_NOT_FOUND, components: [] });
    return;
  }

  const entry = resolved.entry;
  deletePendingPick(pendingId);

  switch (pick.command) {
    case 'title': {
      await editReplyForPickContinuation(interaction, folioEditReplyOptions(buildTitleCard(entry)));
      return;
    }
    case 'edit': {
      await editReplyForPickContinuation(
        interaction,
        folioEditReplyOptions(buildEditInspector(entry)),
      );
      return;
    }
    case 'next': {
      const { result } = await runNextStep(pick.userId, entry);
      await editReplyForPickContinuation(interaction, {
        content: formatNextStepMessage(result),
        embeds: [],
        components: [],
      });
      return;
    }
    case 'complete': {
      const result = await runCompleteStep(pick.userId, entry);
      await editReplyForPickContinuation(interaction, {
        content: formatCompleteStepMessage(result),
        embeds: [],
        components: [],
      });
      return;
    }
    case 'drop': {
      const updated = await runDropStep(pick.userId, entry, pick.extras.reason);
      await editReplyForPickContinuation(interaction, {
        content: formatDropStepMessage(updated, pick.extras.reason),
        embeds: [],
        components: [],
      });
      return;
    }
    case 'rate': {
      if (pick.extras.score === undefined) {
        await editReplyForPickContinuation(interaction, {
          content: 'Missing rating score. Run `/rate` again.',
          components: [],
        });
        return;
      }
      const updated = await runRateStep(pick.userId, entry, pick.extras.score);
      await editReplyForPickContinuation(interaction, {
        content: formatRateStepMessage(updated, pick.extras.score),
        embeds: [],
        components: [],
      });
      return;
    }
    case 'status': {
      if (!pick.extras.status) {
        await editReplyForPickContinuation(interaction, {
          content: 'Missing target status. Run `/status` again.',
          components: [],
        });
        return;
      }
      const updated = await runStatusStep(
        pick.userId,
        entry,
        pick.extras.status,
        pick.extras.reason,
      );
      await editReplyForPickContinuation(interaction, {
        content: formatStatusStepMessage(updated, pick.extras.status),
        embeds: [],
        components: [],
      });
      return;
    }
  }
}
