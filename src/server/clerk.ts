'use server';

import { clerkPageBudget, cancelClerk, confirmClerk, submitClerk, undoClerk } from '@/domain/clerk';
import { CLERK_UNAVAILABLE } from '@/domain/clerk-confirm';
import { requireSession } from '@/server/internal';

export type ClerkPageState = { enabled: boolean; remaining: number; resting: boolean };

export type ClerkChip = { id: string; title: string; category: string; status: string };

export type ClerkDiffLine = {
  title: string;
  category: string;
  status: string;
  label: string;
  editable: { value: number; min: number; max: number } | null;
};

export type ClerkProposalView = { id: string; summary: string; lines: ClerkDiffLine[] };

export type ClerkTurn =
  | { kind: 'proposal'; proposal: ClerkProposalView; remaining: number }
  | { kind: 'chips'; prompt: string; chips: ClerkChip[]; remaining: number }
  | { kind: 'message'; text: string; remaining: number }
  | { kind: 'resting'; text: string; remaining: number };

function allowlisted(userId: string): boolean {
  const ids = (process.env.LLM_ASSISTANT_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  // An empty allowlist fails closed, even when the flag is on.
  return ids.length > 0 && ids.includes(userId);
}

function clerkOpen(userId: string): boolean {
  return process.env.LLM_ASSISTANT_ENABLED === 'true' && allowlisted(userId);
}

export async function getClerkPageState(): Promise<ClerkPageState> {
  const session = await requireSession();
  if (!clerkOpen(session.id)) {
    return { enabled: false, remaining: 0, resting: false };
  }
  const budget = await clerkPageBudget(session.id);
  return { enabled: true, remaining: budget.remaining, resting: budget.resting };
}

/**
 * Submit one sentence. `clientMessageId` is the id for this submit; the
 * browser reuses it until the request settles so a double-click is one call.
 * `entryId`, when set, is the candidate chip the person picked. Bind the
 * sentence to that row instead of searching the title again.
 */
export async function submitClerkSentence(
  message: string,
  clientMessageId: string,
  entryId?: string,
): Promise<ClerkTurn> {
  const session = await requireSession();
  if (!clerkOpen(session.id)) {
    return { kind: 'message', text: CLERK_UNAVAILABLE, remaining: 0 };
  }
  return submitClerk(session.id, message, clientMessageId, entryId);
}

export async function confirmClerkProposal(
  proposalId: string,
  edits: { lineIndex: number; value: number }[],
): Promise<ClerkTurn> {
  const session = await requireSession();
  if (!clerkOpen(session.id)) {
    return { kind: 'message', text: CLERK_UNAVAILABLE, remaining: 0 };
  }
  return confirmClerk(session.id, proposalId, edits);
}

export async function cancelClerkProposal(proposalId: string): Promise<{ ok: true }> {
  const session = await requireSession();
  if (clerkOpen(session.id)) await cancelClerk(session.id, proposalId);
  return { ok: true };
}

export async function undoLastClerkPlan(): Promise<ClerkTurn> {
  const session = await requireSession();
  if (!clerkOpen(session.id)) {
    return { kind: 'message', text: CLERK_UNAVAILABLE, remaining: 0 };
  }
  return undoClerk(session.id);
}
