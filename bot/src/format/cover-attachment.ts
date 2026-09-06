import { AttachmentBuilder } from 'discord.js';
import { decodeCoverImage } from './cover-decode';

export interface DiscordCoverMedia {
  thumbnailUrl: string | null;
  files: AttachmentBuilder[];
}

export function coverToDiscordMedia(coverImage?: string | null): DiscordCoverMedia {
  const decoded = decodeCoverImage(coverImage);
  if (decoded.kind === 'https') return { thumbnailUrl: decoded.url, files: [] };
  if (decoded.kind === 'bytes') {
    return {
      thumbnailUrl: `attachment://${decoded.filename}`,
      files: [new AttachmentBuilder(decoded.buffer, { name: decoded.filename })],
    };
  }
  return { thumbnailUrl: null, files: [] };
}
