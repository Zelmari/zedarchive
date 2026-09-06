import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { resolvePersonalTitle } from '../resolve/title';
import { updateMediaProgressForUser, completeMediaEntryForUser } from '@/domain/media';
import { getNextSeason, sortedSeasonStructure, seasonTotal } from '@/lib/season';
import { formatProgressString } from '../format/progress';

export async function handleNextCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  const titleQuery = interaction.options.getString('title', true);

  await interaction.deferReply({ ephemeral: true });

  const resolved = await resolvePersonalTitle(user.userId, titleQuery);
  if (resolved.notFound || !resolved.entry) {
    await interaction.editReply({
      content: 'No title found in your archive. Use `/add` to track it first.',
    });
    return;
  }

  const entry = resolved.entry;

  // Movie logic: +1 minute is useless, so /next completes the movie
  if (entry.category === 'movie') {
    if (entry.status === 'completed') {
      await interaction.editReply({
        content: `**${entry.title}** is already completed! Use \`/rate\` to give it a score.`,
      });
      return;
    }

    const updated = await completeMediaEntryForUser(user.userId, entry.id);
    await interaction.editReply({
      content: `🎬 Marked **${updated.title}** as completed!`,
    });
    return;
  }

  // Shows, Anime, Books, Manga
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
      const updated = await updateMediaProgressForUser(user.userId, entry.id, {
        primaryUnitCurrent: nextSeasonNum,
        secondaryUnitCurrent: 1,
        secondaryUnitTotal: nextTotal,
      });

      const newProg = formatProgressString(updated);
      await interaction.editReply({
        content: `⏩ Advanced **${updated.title}** to **Season/Vol ${nextSeasonNum}**! (\`${newProg}\`)`,
      });
      return;
    }
  }

  // Linear increment
  const nextVal = entry.secondaryUnitCurrent + 1;
  const updated = await updateMediaProgressForUser(user.userId, entry.id, {
    secondaryUnitCurrent: nextVal,
  });

  const prog = formatProgressString(updated);
  await interaction.editReply({
    content: `▶️ Progress updated for **${updated.title}**: \`${prog}\``,
  });
}
