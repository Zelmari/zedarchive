import type { ChatInputCommandInteraction } from 'discord.js';
import type { MediaRow } from '@/domain/media';
import { updateMediaProgressForUser, completeMediaEntryForUser } from '@/domain/media';
import { getNextSeason, sortedSeasonStructure, seasonTotal } from '@/lib/season';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { resolveTitleForCommand, replyForTitleResolution } from '../resolve/pending-pick';
import { formatProgressString } from '../format/progress';

export type NextStepResult =
  | { kind: 'already_completed'; title: string }
  | { kind: 'movie_completed'; title: string }
  | { kind: 'season_advanced'; title: string; season: number; progress: string }
  | { kind: 'incremented'; title: string; progress: string };

export async function runNextStep(
  userId: string,
  entry: MediaRow,
): Promise<{ result: NextStepResult; updated: MediaRow }> {
  if (entry.category === 'movie') {
    if (entry.status === 'completed') {
      return { result: { kind: 'already_completed', title: entry.title }, updated: entry };
    }

    const updated = (await completeMediaEntryForUser(userId, entry.id)) as unknown as MediaRow;
    return { result: { kind: 'movie_completed', title: updated.title }, updated };
  }

  const structure = sortedSeasonStructure(entry.structure);
  const totalKnown = entry.secondaryUnitTotal !== null && entry.secondaryUnitTotal > 0;
  const atEndOfSeason =
    totalKnown && entry.secondaryUnitCurrent >= (entry.secondaryUnitTotal as number);

  if (atEndOfSeason) {
    const nextSeasonNum = getNextSeason(
      entry.primaryUnitCurrent,
      structure,
      entry.primaryUnitTotal || entry.primaryUnitCurrent,
    );

    if (nextSeasonNum !== null) {
      const nextTotal = seasonTotal(structure, nextSeasonNum);
      const updated = (await updateMediaProgressForUser(userId, entry.id, {
        primaryUnitCurrent: nextSeasonNum,
        secondaryUnitCurrent: 1,
        secondaryUnitTotal: nextTotal,
      })) as unknown as MediaRow;

      return {
        result: {
          kind: 'season_advanced',
          title: updated.title,
          season: nextSeasonNum,
          progress: formatProgressString(updated),
        },
        updated,
      };
    }
  }

  const updated = (await updateMediaProgressForUser(userId, entry.id, {
    secondaryUnitCurrent: entry.secondaryUnitCurrent + 1,
  })) as unknown as MediaRow;

  return {
    result: {
      kind: 'incremented',
      title: updated.title,
      progress: formatProgressString(updated),
    },
    updated,
  };
}

export function formatNextStepMessage(result: NextStepResult): string {
  switch (result.kind) {
    case 'already_completed':
      return `**${result.title}** is already completed. Use \`/rate\` to score it.`;
    case 'movie_completed':
      return `Marked **${result.title}** as completed.`;
    case 'season_advanced':
      return `Advanced **${result.title}** to season/volume **${result.season}** (\`${result.progress}\`).`;
    case 'incremented':
      return `Progress updated for **${result.title}**: \`${result.progress}\`.`;
  }
}

export async function handleNextCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  const outcome = resolveTitleForCommand(resolved, {
    discordUserId: interaction.user.id,
    userId: user.userId,
    command: 'next',
  });

  const entry = await replyForTitleResolution(interaction, outcome);
  if (!entry) return;

  const { result } = await runNextStep(user.userId, entry);
  await interaction.editReply({ content: formatNextStepMessage(result) });
}
