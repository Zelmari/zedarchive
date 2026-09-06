import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { listPersonalLibraryLite } from '@/domain/media';
import { getUpcomingAirdates } from '@/domain/airdate';
import { folioEditReplyOptions } from '../format/reply-cover';
import { buildChromeFolio } from '../format/folio';

export async function handleAiringCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  await interaction.deferReply({ ephemeral: true });

  const entries = await listPersonalLibraryLite(user.userId, {
    status: 'in_progress',
    limit: 50,
  });

  const activeShows = entries.filter(
    (e) => (e.category === 'show' || e.category === 'anime') && e.sourceId,
  );

  if (activeShows.length === 0) {
    await interaction.editReply({
      content: 'You have no catalog-linked shows or anime currently in progress.',
    });
    return;
  }

  const items = activeShows.map((e) => ({
    sourceId: e.sourceId!,
    title: e.title,
  }));

  const airdates = await getUpcomingAirdates(items);

  const lines: string[] = [];
  for (const show of activeShows) {
    const airInfo = show.sourceId ? airdates[show.sourceId] : null;
    if (airInfo && airInfo.airdate) {
      const epLabel = `S${airInfo.season}E${airInfo.number}`;
      lines.push(`• **${show.title}**\n  └ Next: \`${epLabel}\` airs on **${airInfo.airdate}**`);
    }
  }

  const body =
    lines.length === 0
      ? 'No upcoming broadcast dates announced for your active shows and anime right now. Check back soon!'
      : lines.join('\n\n');

  await interaction.editReply(
    folioEditReplyOptions(buildChromeFolio({ heading: 'Upcoming Broadcast Radar', body })),
  );
}
