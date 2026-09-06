import { coverToDiscordMedia, type DiscordCoverMedia } from './cover-attachment';

/** Cover URLs/attachments for Components V2 thumbnails. Same decode path as embeds. */
export function folioCoverMedia(coverImage?: string | null): DiscordCoverMedia {
  return coverToDiscordMedia(coverImage);
}
