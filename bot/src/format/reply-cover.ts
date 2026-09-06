import type {
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionUpdateOptions,
} from 'discord.js';
import { MessageFlags, TextDisplayBuilder } from 'discord.js';
import type { FolioMessage } from './folio';

const V2 = MessageFlags.IsComponentsV2;

export function folioEditReplyOptions(folio: FolioMessage): InteractionEditReplyOptions {
  return {
    content: null,
    embeds: [],
    components: folio.components,
    files: folio.files,
    attachments: [],
    flags: V2,
    withComponents: true,
  };
}

export function folioReplyOptions(
  folio: FolioMessage,
  options?: { ephemeral?: boolean },
): InteractionReplyOptions {
  const ephemeral = options?.ephemeral ?? true;
  return {
    embeds: [],
    components: folio.components,
    files: folio.files,
    flags: ephemeral ? V2 | MessageFlags.Ephemeral : V2,
  };
}

export function folioUpdateOptions(folio: FolioMessage): InteractionUpdateOptions {
  return {
    content: null,
    embeds: [],
    components: folio.components,
    files: folio.files,
    attachments: [],
    flags: V2,
  };
}

function v2TextComponents(content: string) {
  return [new TextDisplayBuilder().setContent(content)];
}

/** Replace a V2 plate with plain copy (cancel, save, empty page). */
export function folioPlainEditReplyOptions(content: string): InteractionEditReplyOptions {
  return {
    content: null,
    embeds: [],
    components: v2TextComponents(content),
    files: [],
    attachments: [],
    flags: V2,
    withComponents: true,
  };
}

export function folioPlainUpdateOptions(content: string): InteractionUpdateOptions {
  return {
    content: null,
    embeds: [],
    components: v2TextComponents(content),
    files: [],
    attachments: [],
    flags: V2,
  };
}
