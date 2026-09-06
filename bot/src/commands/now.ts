import type { ChatInputCommandInteraction } from 'discord.js';
import { requireLinkedUser } from '../auth/require-linked-user';
import { listPersonalLibraryLite } from '@/domain/media';
import { folioEditReplyOptions } from '../format/reply-cover';
import { buildListFolio, formatLibraryLine } from '../format/folio';

export async function handleNowCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await requireLinkedUser(interaction);
  if (!user) return;

  await interaction.deferReply({ ephemeral: true });

  const entries = await listPersonalLibraryLite(user.userId, {
    status: 'in_progress',
    limit: 10,
  });

  if (entries.length === 0) {
    await interaction.editReply({
      content: 'You have no titles currently in progress. Use `/add` to track something new.',
    });
    return;
  }

  const folio = buildListFolio({
    heading: 'Currently In Progress',
    lines: entries.map((entry, index) => formatLibraryLine(entry, { index: index + 1 })),
  });

  await interaction.editReply(folioEditReplyOptions(folio));
}
