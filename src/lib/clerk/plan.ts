import { z } from 'zod';
import {
  MAX_DROP_REASON_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_RATING,
  MAX_TITLE_LENGTH,
} from '@/lib/constants';
import { INCREMENT_PRIMARY_MAX, INCREMENT_SECONDARY_MAX, MAX_ACTIONS } from './limits';
import { normalizeTitle } from './match';
import type { ClerkAction, ClerkPlan } from './types';

const categories = ['show', 'movie', 'book', 'anime', 'manga'] as const;
const statuses = ['in_progress', 'completed', 'planning', 'on_hold', 'dropped'] as const;
const spokenUnits = ['chapter', 'page', 'episode'] as const;
const storedUnits = ['chapter', 'page'] as const;

const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_\-#]+$/, 'Tags may only contain letters, numbers, hyphens, underscores, and #');

const entryId = z.string().trim().min(1).max(80);

const incrementSecondary = z
  .object({
    type: z.literal('increment_secondary'),
    entryId,
    amount: z.number().int().min(1).max(INCREMENT_SECONDARY_MAX),
    unit: z.enum(spokenUnits).nullable(),
  })
  .strict();

const incrementPrimary = z
  .object({
    type: z.literal('increment_primary'),
    entryId,
    amount: z.number().int().min(1).max(INCREMENT_PRIMARY_MAX),
  })
  .strict();

const setProgress = z
  .object({
    type: z.literal('set_progress'),
    entryId,
    primary: z.number().int().min(0).max(10000).nullable(),
    secondary: z.number().int().min(0).max(100000).nullable(),
    unit: z.enum(spokenUnits).nullable(),
  })
  .strict();

const setStatus = z
  .object({
    type: z.literal('set_status'),
    entryId,
    status: z.enum(statuses),
    dropReason: z.string().trim().max(MAX_DROP_REASON_LENGTH).nullable(),
  })
  .strict();

const setRating = z
  .object({
    type: z.literal('set_rating'),
    entryId,
    rating: z.number().int().min(1).max(MAX_RATING),
  })
  .strict();

const appendNote = z
  .object({
    type: z.literal('append_note'),
    entryId,
    text: z.string().trim().min(1).max(MAX_NOTES_LENGTH),
  })
  .strict();

const addQuote = z
  .object({
    type: z.literal('add_quote'),
    entryId,
    text: z.string().trim().min(1).max(2000),
    speaker: z.string().trim().max(100).nullable(),
    citation: z.string().trim().max(100).nullable(),
  })
  .strict();

const tagAction = (type: 'add_tags' | 'remove_tags') =>
  z
    .object({
      type: z.literal(type),
      entryId,
      tags: z.array(tagSchema).min(1).max(50),
    })
    .strict();

const setQueued = z
  .object({
    type: z.literal('set_queued'),
    entryId,
    queued: z.boolean(),
  })
  .strict();

const createFromCatalog = z
  .object({
    type: z.literal('create_from_catalog'),
    category: z.enum(categories),
    query: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    author: z.string().trim().max(200).nullable(),
    year: z.number().int().min(1000).max(3000).nullable(),
  })
  .strict();

const setUnit = z
  .object({
    type: z.literal('set_unit'),
    entryId,
    unit: z.enum(storedUnits),
  })
  .strict();

const modelActionSchema = z.discriminatedUnion('type', [
  incrementSecondary,
  incrementPrimary,
  setProgress,
  setStatus,
  setRating,
  appendNote,
  addQuote,
  tagAction('add_tags'),
  tagAction('remove_tags'),
  setQueued,
  createFromCatalog,
  setUnit,
]);

const catalogHitSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    category: z.enum(categories),
    coverUrl: z.string().trim().max(2000).nullable(),
    primaryUnitTotal: z.number().int().min(0).nullable(),
    secondaryUnitTotal: z.number().int().min(0).nullable(),
    authors: z.string().trim().max(500).nullable(),
    year: z.string().trim().max(20).nullable(),
  })
  .strict();

const storedCreate = createFromCatalog
  .extend({
    hit: catalogHitSchema.nullable(),
  })
  .strict();

const storedActionSchema = z.discriminatedUnion('type', [
  incrementSecondary,
  incrementPrimary,
  setProgress,
  setStatus,
  setRating,
  appendNote,
  addQuote,
  tagAction('add_tags'),
  tagAction('remove_tags'),
  setQueued,
  storedCreate,
  setUnit,
]);

const modelPlanSchema = z
  .object({
    actions: z.array(modelActionSchema).min(1).max(MAX_ACTIONS),
  })
  .strict();

const storedPlanSchema = z
  .object({
    actions: z.array(storedActionSchema).min(1).max(MAX_ACTIONS),
  })
  .strict();

export interface PlanParseFailure {
  ok: false;
  reason: 'invalid' | 'unknown_id' | 'mixed_create';
}

export interface PlanParseSuccess {
  ok: true;
  plan: ClerkPlan;
}

function idsOf(actions: ClerkAction[]): string[] {
  return actions.flatMap((action) => ('entryId' in action ? [action.entryId] : []));
}

function finish(
  actions: ClerkAction[],
  candidateIds: readonly string[],
): PlanParseSuccess | PlanParseFailure {
  if (actions.length > MAX_ACTIONS) return { ok: false, reason: 'invalid' };
  const allowed = new Set(candidateIds);
  if (idsOf(actions).some((id) => !allowed.has(id))) return { ok: false, reason: 'unknown_id' };
  const creates = actions.filter((action) => action.type === 'create_from_catalog').length;
  if (creates > 0 && actions.length !== 1) return { ok: false, reason: 'mixed_create' };
  const progress = actions.find((action) => action.type === 'set_progress');
  if (
    progress &&
    progress.type === 'set_progress' &&
    progress.primary == null &&
    progress.secondary == null
  ) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, plan: { actions } };
}

/** Tool arguments from the model. `hit` is not accepted here. */
export function parseModelPlan(
  input: unknown,
  candidateIds: readonly string[],
): PlanParseSuccess | PlanParseFailure {
  const parsed = modelPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const actions: ClerkAction[] = parsed.data.actions.map((action) =>
    action.type === 'create_from_catalog' ? { ...action, hit: null } : action,
  );
  return finish(actions, candidateIds);
}

/** A proposal loaded from Postgres, including a server-resolved catalog hit. */
export function parseStoredPlan(
  input: unknown,
  candidateIds: readonly string[],
): PlanParseSuccess | PlanParseFailure {
  const parsed = storedPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  return finish(parsed.data.actions, candidateIds);
}

/**
 * Same actions as the model schema, with the candidate ids pinned in an enum.
 * OpenAI strict mode wants `additionalProperties: false` and every key required.
 */
export function planSchemaForCandidates(candidateIds: readonly string[]): Record<string, unknown> {
  const ids = [...candidateIds];
  const entryIdSchema =
    ids.length > 0 ? { type: 'string', enum: ids } : { type: 'string', enum: ['__none__'] };
  const nullableUnit = { anyOf: [{ type: 'string', enum: [...spokenUnits] }, { type: 'null' }] };
  const object = (properties: Record<string, unknown>, required: string[]) => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  });
  const withEntry = (type: string, extra: Record<string, unknown>) =>
    object({ type: { type: 'string', const: type }, entryId: entryIdSchema, ...extra }, [
      'type',
      'entryId',
      ...Object.keys(extra),
    ]);

  const updateActions =
    ids.length === 0
      ? []
      : [
          withEntry('increment_secondary', {
            amount: { type: 'integer', minimum: 1, maximum: INCREMENT_SECONDARY_MAX },
            unit: nullableUnit,
          }),
          withEntry('increment_primary', {
            amount: { type: 'integer', minimum: 1, maximum: INCREMENT_PRIMARY_MAX },
          }),
          withEntry('set_progress', {
            primary: { anyOf: [{ type: 'integer', minimum: 0, maximum: 10000 }, { type: 'null' }] },
            secondary: {
              anyOf: [{ type: 'integer', minimum: 0, maximum: 100000 }, { type: 'null' }],
            },
            unit: nullableUnit,
          }),
          withEntry('set_status', {
            status: { type: 'string', enum: [...statuses] },
            dropReason: {
              anyOf: [{ type: 'string', maxLength: MAX_DROP_REASON_LENGTH }, { type: 'null' }],
            },
          }),
          withEntry('set_rating', {
            rating: { type: 'integer', minimum: 1, maximum: MAX_RATING },
          }),
          withEntry('append_note', {
            text: { type: 'string', minLength: 1, maxLength: MAX_NOTES_LENGTH },
          }),
          withEntry('add_quote', {
            text: { type: 'string', minLength: 1, maxLength: 2000 },
            speaker: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] },
            citation: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] },
          }),
          withEntry('add_tags', {
            tags: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: { type: 'string', minLength: 1, maxLength: 50, pattern: '^[a-z0-9_\\-#]+$' },
            },
          }),
          withEntry('remove_tags', {
            tags: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: { type: 'string', minLength: 1, maxLength: 50, pattern: '^[a-z0-9_\\-#]+$' },
            },
          }),
          withEntry('set_queued', { queued: { type: 'boolean' } }),
          withEntry('set_unit', { unit: { type: 'string', enum: [...storedUnits] } }),
        ];

  const createAction = object(
    {
      type: { type: 'string', const: 'create_from_catalog' },
      category: { type: 'string', enum: [...categories] },
      query: { type: 'string', minLength: 1, maxLength: MAX_TITLE_LENGTH },
      author: { anyOf: [{ type: 'string', maxLength: 200 }, { type: 'null' }] },
      year: { anyOf: [{ type: 'integer', minimum: 1000, maximum: 3000 }, { type: 'null' }] },
    },
    ['type', 'category', 'query', 'author', 'year'],
  );

  const branches = ids.length === 0 ? [createAction] : [...updateActions, createAction];
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      actions: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_ACTIONS,
        items: branches.length === 1 ? branches[0] : { anyOf: branches },
      },
    },
    required: ['actions'],
  };
}

const HARD_REFUSALS: { pattern: RegExp; text: string }[] = [
  {
    pattern: /\b(?:delete|remove|close)\s+(?:my\s+)?account\b/,
    text: 'Account changes stay in settings.',
  },
  {
    pattern: /\b(?:rewatch(?:ed)?|re-watch(?:ed)?|reread|re-read)\b/,
    text: 'Rewatch and reread stay on the title editor.',
  },
];

const SOFT_REFUSALS: { pattern: RegExp; text: string }[] = [
  {
    pattern: /\b(?:recommend(?:ation)?s?|what should i)\b/,
    text: 'The clerk does not recommend titles.',
  },
  {
    pattern: /\b(?:spoil(?:er|ers)?|what happens|the plot|plot of)\b/,
    text: 'The clerk does not discuss the plot.',
  },
  {
    pattern: /\b(?:how many|my stats|statistics)\b/,
    text: 'The clerk does not answer stats questions.',
  },
];

/**
 * Account changes and rewatch always stop.
 * Plot, stats, and recommendation words do not stop a sentence that names a library title,
 * so "The Plot Against America" can still be updated.
 */
export function refuseLocally(message: string, titles: readonly string[] = []): string | null {
  const text = message.toLowerCase();
  for (const refusal of HARD_REFUSALS) {
    if (refusal.pattern.test(text)) return refusal.text;
  }
  const sentence = normalizeTitle(message);
  const mentionsTitle = titles.some((title) => {
    const normalized = normalizeTitle(title);
    return normalized.length >= 3 && sentence.includes(normalized);
  });
  if (mentionsTitle) return null;
  for (const refusal of SOFT_REFUSALS) {
    if (refusal.pattern.test(text)) return refusal.text;
  }
  return null;
}
