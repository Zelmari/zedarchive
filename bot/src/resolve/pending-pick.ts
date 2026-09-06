import crypto from 'crypto';
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  type ChatInputCommandInteraction,
  type InteractionEditReplyOptions,
} from 'discord.js';
import type { MediaRow, TitleResolutionResult } from '@/domain/media';
import { formatProgressString } from '../format/progress';
import { TITLE_NOT_FOUND } from '../format/labels';

const PICK_TTL_MS = 14 * 60 * 1000;

export type PendingPickCommand =
  'title' | 'edit' | 'next' | 'complete' | 'drop' | 'rate' | 'status';

export interface PendingPickExtras {
  score?: number;
  status?: string;
  reason?: string;
}

export interface PendingPick {
  pendingId: string;
  discordUserId: string;
  userId: string;
  command: PendingPickCommand;
  extras: PendingPickExtras;
  createdAt: number;
  expiresAt: number;
}

const pickStore = new Map<string, PendingPick>();

const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [id, pick] of pickStore.entries()) {
      if (now >= pick.expiresAt) {
        pickStore.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);
cleanupInterval.unref?.();

function truncateLabel(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function buildPickOptionLabel(entry: MediaRow): string {
  const progress = formatProgressString(entry);
  const withProgress = `${entry.title} (${progress})`;
  return truncateLabel(withProgress, 100);
}

export function createPendingPick(
  data: Omit<PendingPick, 'pendingId' | 'createdAt' | 'expiresAt'>,
): PendingPick {
  const pendingId = crypto.randomUUID().slice(0, 8);
  const now = Date.now();
  const pick: PendingPick = {
    ...data,
    pendingId,
    createdAt: now,
    expiresAt: now + PICK_TTL_MS,
  };
  pickStore.set(pendingId, pick);
  return pick;
}

export function getPendingPick(pendingId: string): PendingPick | null {
  const pick = pickStore.get(pendingId);
  if (!pick) return null;
  if (Date.now() >= pick.expiresAt) {
    pickStore.delete(pendingId);
    return null;
  }
  return pick;
}

export function deletePendingPick(pendingId: string): void {
  pickStore.delete(pendingId);
}

export function buildAmbiguousPickComponents(
  entries: MediaRow[],
  pendingId: string,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const options = entries.slice(0, 25).map((entry) => ({
    label: buildPickOptionLabel(entry),
    value: entry.id,
  }));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`za:pick:${pendingId}`)
      .setPlaceholder('Multiple matches — pick the title you meant')
      .addOptions(options),
  );

  return [row];
}

export type TitleResolutionOutcome =
  | { kind: 'entry'; entry: MediaRow }
  | { kind: 'not_found' }
  | {
      kind: 'ambiguous';
      pendingId: string;
      components: ActionRowBuilder<StringSelectMenuBuilder>[];
    };

export function resolveTitleForCommand(
  resolved: TitleResolutionResult,
  ctx: {
    discordUserId: string;
    userId: string;
    command: PendingPickCommand;
    extras?: PendingPickExtras;
  },
): TitleResolutionOutcome {
  if (resolved.entry) {
    return { kind: 'entry', entry: resolved.entry };
  }

  if (resolved.ambiguous && resolved.ambiguous.length > 0) {
    const pick = createPendingPick({
      discordUserId: ctx.discordUserId,
      userId: ctx.userId,
      command: ctx.command,
      extras: ctx.extras ?? {},
    });
    return {
      kind: 'ambiguous',
      pendingId: pick.pendingId,
      components: buildAmbiguousPickComponents(resolved.ambiguous, pick.pendingId),
    };
  }

  return { kind: 'not_found' };
}

export async function replyForTitleResolution(
  interaction: ChatInputCommandInteraction,
  outcome: TitleResolutionOutcome,
): Promise<MediaRow | null> {
  if (outcome.kind === 'entry') {
    return outcome.entry;
  }

  if (outcome.kind === 'not_found') {
    await interaction.editReply({ content: TITLE_NOT_FOUND });
    return null;
  }

  await interaction.editReply({
    content: 'Multiple titles matched. Pick the one you meant:',
    components: outcome.components,
  });
  return null;
}

export async function editReplyForPickContinuation(
  interaction: StringSelectMenuInteraction,
  payload: InteractionEditReplyOptions,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.update(payload);
  }
}

export const PICK_EXPIRED_COPY = 'That title picker expired. Run the command again.';
