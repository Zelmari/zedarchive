import type {
  AttachmentBuilder,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionUpdateOptions,
} from 'discord.js';

export type CoverMessagePayload = {
  embeds: InteractionEditReplyOptions['embeds'];
  components?: InteractionEditReplyOptions['components'];
  files: AttachmentBuilder[];
  content?: string | null;
};

export function coverEditReplyOptions(payload: CoverMessagePayload): InteractionEditReplyOptions {
  return {
    content: payload.content ?? null,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    attachments: [],
  };
}

export function coverReplyOptions(
  payload: CoverMessagePayload & { ephemeral?: boolean },
): InteractionReplyOptions {
  return {
    content: payload.content ?? undefined,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    ephemeral: payload.ephemeral ?? true,
  };
}

export function coverUpdateOptions(payload: CoverMessagePayload): InteractionUpdateOptions {
  return {
    content: payload.content === undefined ? undefined : payload.content,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    attachments: [],
  };
}

export function clearCoverMessageOptions(content: string): InteractionEditReplyOptions {
  return {
    content,
    embeds: [],
    components: [],
    files: [],
    attachments: [],
  };
}
