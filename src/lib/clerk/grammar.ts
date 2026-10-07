import { MAX_ACTIONS, MAX_CANDIDATES } from './limits';
import { rankTitles } from './match';
import { refuseLocally } from './plan';
import { stripHiddenCharacters } from './sanitize';
import type { ClerkAction, ClerkCatalogRow, SecondaryUnit, SpokenSecondary } from './types';

export type GrammarResult =
  | { kind: 'plan'; actions: ClerkAction[]; summary: string }
  | { kind: 'chips'; prompt: string; ids: string[] }
  | { kind: 'narrow'; text: string }
  | { kind: 'refuse'; text: string }
  | { kind: 'clarify'; text: string }
  | { kind: 'miss' }
  | { kind: 'unit'; entryId: string; spoken: SecondaryUnit; title: string };

interface Intent {
  title: string;
  build: (entry: ClerkCatalogRow) => ClerkAction | GrammarResult;
}

const NARROW_TEXT = 'Name one title. The clerk does not update the whole archive at once.';
const RATING_TEXT = 'Tell me a whole number from 1 to 10.';
const RANGE_TEXT = 'That number is outside the range the clerk can apply.';

function cleanTitle(value: string): string {
  return value
    .replace(/\b(?:it was|and it was|which was)\b[\s\S]*$/i, '')
    .replace(/[.!?,;:]+$/g, '')
    .trim();
}

function unitWord(word: string): SpokenSecondary | null {
  if (word.startsWith('chapter')) return 'chapter';
  if (word.startsWith('page')) return 'page';
  if (word.startsWith('episode')) return 'episode';
  return null;
}

function increment(amount: number, unit: SpokenSecondary | null, title: string): Intent {
  return {
    title,
    build(entry) {
      if (amount < 1 || (unit === 'episode' ? amount > 50 : amount > 50)) {
        return { kind: 'clarify', text: RANGE_TEXT };
      }
      const unitCheck = spokenUnitGate(entry, unit);
      if (unitCheck) return unitCheck;
      return {
        type: 'increment_secondary',
        entryId: entry.id,
        amount,
        unit,
      };
    },
  };
}

function spokenUnitGate(
  entry: ClerkCatalogRow,
  unit: SpokenSecondary | null,
): GrammarResult | null {
  if (unit !== 'chapter' && unit !== 'page') {
    if (
      (entry.category === 'book' || entry.category === 'manga') &&
      entry.secondaryUnitKind == null &&
      unit == null
    ) {
      return {
        kind: 'clarify',
        text: `Are those chapters or pages of ${entry.title}?`,
      };
    }
    return null;
  }
  if (entry.category !== 'book' && entry.category !== 'manga') return { kind: 'miss' };
  if (entry.secondaryUnitKind !== unit) {
    return { kind: 'unit', entryId: entry.id, spoken: unit, title: entry.title };
  }
  return null;
}

function parseIntent(text: string): Intent | 'narrow' | GrammarResult | null {
  if (
    /\b(?:update|mark|set|change)\s+all\b|\beverything\b|\ball (?:of )?(?:my|the) (?:books|shows|movies|entries|titles)\b/.test(
      text,
    )
  ) {
    return 'narrow';
  }

  let match = text.match(
    /\b(\d+)\s+more\s+(chapters?|pages?|episodes?|seasons?|volumes?)\s+of\s+(.+)$/,
  );
  if (match?.[1] && match[2] && match[3]) {
    const amount = Number(match[1]);
    const word = match[2];
    const title = cleanTitle(match[3]);
    if (word.startsWith('season') || word.startsWith('volume')) {
      return {
        title,
        build(entry) {
          if (amount < 1 || amount > 10) return { kind: 'clarify', text: RANGE_TEXT };
          return { type: 'increment_primary', entryId: entry.id, amount };
        },
      };
    }
    return increment(amount, unitWord(word), title);
  }

  match = text.match(/\banother\s+(chapter|page|episode)\s+of\s+(.+)$/);
  if (match?.[1] && match[2]) return increment(1, unitWord(match[1]), cleanTitle(match[2]));

  match = text.match(/\b(?:read|watched)\s+(\d+)\s+(chapters?|pages?|episodes?)\s+of\s+(.+)$/);
  if (match?.[1] && match[2] && match[3]) {
    return increment(Number(match[1]), unitWord(match[2]), cleanTitle(match[3]));
  }

  match = text.match(
    /\b(?:i'm|i am|im)\s+on\s+(chapter|page|episode|season|volume)\s+(\d+)\s+of\s+(.+)$/,
  );
  if (match?.[1] && match[2] && match[3]) {
    const word = match[1];
    const value = Number(match[2]);
    const title = cleanTitle(match[3]);
    return {
      title,
      build(entry) {
        if (word === 'season' || word === 'volume') {
          return {
            type: 'set_progress',
            entryId: entry.id,
            primary: value,
            secondary: null,
            unit: null,
          };
        }
        const unit = unitWord(word);
        const gate = spokenUnitGate(entry, unit);
        if (gate) return gate;
        return {
          type: 'set_progress',
          entryId: entry.id,
          primary: null,
          secondary: value,
          unit,
        };
      },
    };
  }

  match = text.match(
    /\b(?:rate|rated|rating)\s+(.+?)\s+(?:a\s+)?(\d{1,2})(?:\s*\/\s*10|\s+out of 10)?$/,
  );
  if (match?.[1] && match[2]) {
    const rating = Number(match[2]);
    const title = cleanTitle(match[1]);
    return {
      title,
      build(entry) {
        if (rating < 1 || rating > 10) return { kind: 'clarify', text: RATING_TEXT };
        return { type: 'set_rating', entryId: entry.id, rating };
      },
    };
  }

  match = text.match(/\b(\d{1,2})\s*(?:\/\s*10|out of 10)\s+(?:for|on|to)\s+(.+)$/);
  if (match?.[1] && match[2]) {
    const rating = Number(match[1]);
    const title = cleanTitle(match[2]);
    return {
      title,
      build(entry) {
        if (rating < 1 || rating > 10) return { kind: 'clarify', text: RATING_TEXT };
        return { type: 'set_rating', entryId: entry.id, rating };
      },
    };
  }

  match = text.match(/\bdropped\s+(.+?)(?:\s+because\s+(.+))?$/);
  if (match?.[1]) {
    const title = cleanTitle(match[1]);
    const reason = match[2]?.trim() ? match[2].trim().slice(0, 500) : null;
    return {
      title,
      build: (entry) => ({
        type: 'set_status',
        entryId: entry.id,
        status: 'dropped',
        dropReason: reason,
      }),
    };
  }

  match = text.match(/\b(?:finished|done with|completed)\s+(.+)$/);
  if (match?.[1]) {
    const title = cleanTitle(match[1]);
    return {
      title,
      build: (entry) => ({
        type: 'set_status',
        entryId: entry.id,
        status: 'completed',
        dropReason: null,
      }),
    };
  }

  match = text.match(/\b(?:started|start)\s+(?:reading|watching|to read|to watch\s+)?(.+)$/);
  if (match?.[1]) {
    const title = cleanTitle(match[1]);
    return {
      title,
      build: (entry) => ({
        type: 'set_status',
        entryId: entry.id,
        status: 'in_progress',
        dropReason: null,
      }),
    };
  }

  match = text.match(/\b(?:i\s+)?watched\s+(.+)$/);
  if (match?.[1]) {
    const title = cleanTitle(match[1]);
    return {
      title,
      build(entry) {
        if (entry.category !== 'movie') return { kind: 'miss' };
        return {
          type: 'set_status',
          entryId: entry.id,
          status: 'completed',
          dropReason: null,
        };
      },
    };
  }

  if (
    /\b(?:pretty good|was great|loved it|really good|not good|terrible|amazing)\b/.test(text) &&
    !/\b(?:[1-9]|10)\s*(?:\/\s*10|out of 10)?\b/.test(text)
  ) {
    return { kind: 'clarify', text: RATING_TEXT };
  }

  return null;
}

function resolve(intent: Intent, entries: readonly ClerkCatalogRow[]): GrammarResult {
  const hits = rankTitles(intent.title, entries, MAX_CANDIDATES + 1);
  if (hits.length > MAX_CANDIDATES) {
    return { kind: 'narrow', text: NARROW_TEXT };
  }
  if (hits.length >= 2) {
    return {
      kind: 'chips',
      prompt: 'Which title do you mean?',
      ids: hits.slice(0, 3).map((hit) => hit.id),
    };
  }
  if (hits.length === 0) return { kind: 'miss' };
  const hit = hits[0];
  if (!hit) return { kind: 'miss' };
  const built = intent.build(hit);
  if ('kind' in built) return built;
  const summary = summaryFor(built, hit);
  return { kind: 'plan', actions: [built], summary };
}

function summaryFor(action: ClerkAction, entry: ClerkCatalogRow): string {
  switch (action.type) {
    case 'increment_secondary': {
      const noun =
        action.unit === 'page' ? 'pages' : action.unit === 'episode' ? 'episodes' : 'chapters';
      return `Add ${action.amount} ${noun} to ${entry.title}.`;
    }
    case 'increment_primary':
      return `Add ${action.amount} to the season or volume of ${entry.title}.`;
    case 'set_progress':
      return `Set the position on ${entry.title}.`;
    case 'set_status':
      return action.status === 'completed'
        ? `Mark ${entry.title} completed.`
        : action.status === 'dropped'
          ? `Mark ${entry.title} dropped.`
          : `Mark ${entry.title} in progress.`;
    case 'set_rating':
      return `Rate ${entry.title} ${action.rating} out of 10.`;
    default:
      return `Update ${entry.title}.`;
  }
}

/** Local shapes only. A miss means the caller may spend one model call. */
export function parseGrammar(message: string, entries: readonly ClerkCatalogRow[]): GrammarResult {
  const stripped = stripHiddenCharacters(message).replace(/\s+/g, ' ').trim();
  if (!stripped) return { kind: 'miss' };
  const refusal = refuseLocally(stripped);
  if (refusal) return { kind: 'refuse', text: refusal };
  if (stripped.length > 1000) return { kind: 'miss' };

  const intent = parseIntent(stripped.toLowerCase());
  if (intent == null) return { kind: 'miss' };
  if (intent === 'narrow') return { kind: 'narrow', text: NARROW_TEXT };
  if ('kind' in intent) return intent;
  if (MAX_ACTIONS < 1) return { kind: 'miss' };
  return resolve(intent, entries);
}
