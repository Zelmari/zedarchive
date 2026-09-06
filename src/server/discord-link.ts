'use server';

import { getAuthUser } from './internal';
import {
  createDiscordLinkCode,
  getDiscordLinkByUserId,
  unlinkByUserId,
  type DiscordLinkInfo,
} from '@/domain/discord-link';

export interface CreateLinkCodeResponse {
  ok: boolean;
  code?: string;
  expiresAt?: string;
  error?: string;
}

export interface LinkStatusResponse {
  ok: boolean;
  linked: boolean;
  discordUsername?: string | null;
  discordUserId?: string;
  createdAt?: string;
  botPublicName: string;
  error?: string;
}

export async function createDiscordLinkCodeAction(): Promise<CreateLinkCodeResponse> {
  try {
    const user = await getAuthUser();
    const result = await createDiscordLinkCode(user.id);
    return {
      ok: true,
      code: result.code,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate link code';
    return { ok: false, error: message };
  }
}

export async function getDiscordLinkStatusAction(): Promise<LinkStatusResponse> {
  try {
    const user = await getAuthUser();
    const link: DiscordLinkInfo | null = await getDiscordLinkByUserId(user.id);
    const botPublicName = process.env.DISCORD_BOT_PUBLIC_NAME || 'ZedArchive';

    if (!link) {
      return {
        ok: true,
        linked: false,
        botPublicName,
      };
    }

    return {
      ok: true,
      linked: true,
      discordUsername: link.discordUsername,
      discordUserId: link.discordUserId,
      createdAt:
        link.createdAt instanceof Date ? link.createdAt.toISOString() : String(link.createdAt),
      botPublicName,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check link status';
    return {
      ok: false,
      linked: false,
      botPublicName: 'ZedArchive',
      error: message,
    };
  }
}

export async function unlinkDiscordAction(): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getAuthUser();
    await unlinkByUserId(user.id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to unlink Discord';
    return { ok: false, error: message };
  }
}
