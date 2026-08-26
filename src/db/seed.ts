/**
 * Database seeding engine — populates a local dev database with a demo user
 * and a curated, realistic archive so `npm run setup` yields a living product
 * instead of an empty shell.
 *
 * Usage: npm run db:seed (requires DATABASE_URL; idempotent per email).
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { user, account, mediaEntries, mediaActivityLogs } from './schema';
import type { MediaCategory, MediaStatus, StructureItem } from '@/types/media';

const DEMO_EMAIL = 'demo@zedarchive.com';
const DEMO_PASSWORD = 'password123';

interface SeedEntry {
  title: string;
  category: MediaCategory;
  status: MediaStatus;
  primaryUnitCurrent?: number;
  primaryUnitTotal?: number | null;
  secondaryUnitCurrent?: number;
  secondaryUnitTotal?: number | null;
  structure?: StructureItem[];
  rating?: number | null;
  tags?: string[];
  genres?: string[];
  synopsis?: string | null;
  notes?: string | null;
  rewatchCount?: number;
  sourceId?: string | null;
}

function structure(names: Array<[string, number | null]>): StructureItem[] {
  return names.map(([name, total], i) => ({ number: i + 1, name, total }));
}

const DEMO_ENTRIES: SeedEntry[] = [
  {
    title: 'Frieren: Beyond Journey\u2019s End',
    category: 'show',
    status: 'in_progress',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 4,
    secondaryUnitCurrent: 14,
    secondaryUnitTotal: 28,
    structure: structure([
      ['Season 1', 28],
      ['Season 2', null],
      ['Season 3', null],
      ['Season 4', null],
    ]),
    rating: 10,
    tags: ['favorites', 'cozy'],
    genres: ['fantasy', 'adventure'],
    synopsis: 'An elven mage reflects on mortality after the hero party disbands.',
    sourceId: 'tvmaze-459748',
  },
  {
    title: 'Severance',
    category: 'show',
    status: 'completed',
    primaryUnitCurrent: 2,
    primaryUnitTotal: 2,
    secondaryUnitCurrent: 10,
    secondaryUnitTotal: 10,
    structure: structure([
      ['Season 1', 9],
      ['Season 2', 10],
    ]),
    rating: 9,
    tags: ['favorites'],
    genres: ['thriller', 'sci-fi'],
    synopsis: 'Office workers surgically divide their memories between work and life.',
    rewatchCount: 1,
  },
  {
    title: 'Succession',
    category: 'show',
    status: 'completed',
    primaryUnitCurrent: 4,
    primaryUnitTotal: 4,
    secondaryUnitCurrent: 10,
    secondaryUnitTotal: 10,
    structure: structure([
      ['Season 1', 10],
      ['Season 2', 10],
      ['Season 3', 9],
      ['Season 4', 10],
    ]),
    rating: 10,
    tags: ['favorites'],
    genres: ['drama'],
  },
  {
    title: 'The Bear',
    category: 'show',
    status: 'in_progress',
    primaryUnitCurrent: 3,
    primaryUnitTotal: 4,
    secondaryUnitCurrent: 2,
    secondaryUnitTotal: 10,
    structure: structure([
      ['Season 1', 8],
      ['Season 2', 10],
      ['Season 3', 10],
      ['Season 4', 10],
    ]),
    tags: ['summer-2026'],
    genres: ['drama', 'comedy'],
  },
  {
    title: 'Chernobyl',
    category: 'show',
    status: 'dropped',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 2,
    secondaryUnitTotal: 5,
    structure: structure([['Miniseries', 5]]),
  },
  {
    title: 'Steins;Gate',
    category: 'anime',
    status: 'completed',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 24,
    secondaryUnitTotal: 24,
    structure: structure([['Season 1', 24]]),
    rating: 10,
    tags: ['favorites'],
    genres: ['sci-fi', 'thriller'],
    synopsis: 'A self-proclaimed mad scientist discovers a way to send texts to the past.',
    rewatchCount: 2,
    sourceId: 'anilist-21',
  },
  {
    title: 'Monster',
    category: 'anime',
    status: 'in_progress',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 41,
    secondaryUnitTotal: 74,
    structure: structure([['Season 1', 74]]),
    rating: 9,
    genres: ['thriller', 'psychological'],
    sourceId: 'anilist-19',
  },
  {
    title: 'Vinland Saga',
    category: 'anime',
    status: 'planning',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 2,
    structure: structure([
      ['Season 1', 24],
      ['Season 2', 24],
    ]),
    tags: ['summer-2026'],
    genres: ['historical', 'action'],
  },
  {
    title: 'Berserk',
    category: 'manga',
    status: 'in_progress',
    primaryUnitCurrent: 8,
    primaryUnitTotal: 43,
    secondaryUnitCurrent: 12,
    structure: structure(
      Array.from({ length: 43 }, (_, i) => [`Volume ${i + 1}`, null] as [string, number | null]),
    ),
    rating: 10,
    tags: ['favorites'],
    genres: ['dark fantasy', 'seinen'],
    synopsis: 'Guts, a mercenary branded for sacrifice, wars against fate itself.',
    rewatchCount: 3,
  },
  {
    title: 'Vagabond',
    category: 'manga',
    status: 'on_hold',
    primaryUnitCurrent: 5,
    primaryUnitTotal: 37,
    secondaryUnitCurrent: 40,
    structure: structure(
      Array.from({ length: 37 }, (_, i) => [`Volume ${i + 1}`, null] as [string, number | null]),
    ),
    genres: ['historical', 'seinen'],
  },
  {
    title: 'Dune',
    category: 'book',
    status: 'completed',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 688,
    secondaryUnitTotal: 688,
    rating: 9,
    tags: ['favorites', 'cozy'],
    genres: ['science fiction'],
    synopsis: 'Paul Atreides navigates prophecy and politics on the desert world Arrakis.',
    rewatchCount: 1,
    notes: 'Reread before Part Two — the Fremen ecology chapters are the best part.',
  },
  {
    title: 'Klara and the Sun',
    category: 'book',
    status: 'completed',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 303,
    secondaryUnitTotal: 303,
    rating: 8,
    genres: ['science fiction', 'literary fiction'],
    synopsis: 'An artificial friend observes the world from her store window.',
  },
  {
    title: 'Project Hail Mary',
    category: 'book',
    status: 'in_progress',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 132,
    secondaryUnitTotal: 476,
    tags: ['summer-2026'],
    genres: ['science fiction'],
    rating: 9,
  },
  {
    title: 'The Pragmatic Programmer',
    category: 'book',
    status: 'in_progress',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 210,
    secondaryUnitTotal: 352,
    genres: ['technology'],
    notes: 'Orthogonality chapter pairs well with the refactoring work.',
  },
  {
    title: 'Norwegian Wood',
    category: 'book',
    status: 'planning',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    genres: ['literary fiction'],
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  // Safety rail: seeding is meant for the local docker database. Refuse to
  // touch anything that looks remote unless explicitly forced.
  const { hostname } = new URL(connectionString);
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocal && process.argv[2] !== '--force') {
    console.error(
      `Refusing to seed non-local database host "${hostname}". ` +
        'Point DATABASE_URL at the docker Postgres (localhost:5432) or pass --force.',
    );
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(sql);

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, DEMO_EMAIL));

  if (existing) {
    console.log(`Demo user ${DEMO_EMAIL} already exists — skipping seed.`);
    await sql.end();
    return;
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await db.insert(user).values({
    id: userId,
    name: 'zelmari',
    email: DEMO_EMAIL,
    emailVerified: true,
    theme: 'parchment',
    username: 'zelmari',
    isPublic: true,
    bio: 'Demo archive — shows, anime, manga, and books.',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: DEMO_EMAIL,
    providerId: 'credential',
    userId,
    password: passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const now = Date.now();
  let dayOffset = DEMO_ENTRIES.length;

  for (const entry of DEMO_ENTRIES) {
    const id = crypto.randomUUID();
    const updatedAt = new Date(now - dayOffset * 20 * 60 * 60 * 1000);
    dayOffset -= 1;

    await db.insert(mediaEntries).values({
      id,
      userId,
      title: entry.title,
      category: entry.category,
      status: entry.status,
      completedAt: entry.status === 'completed' ? updatedAt : null,
      startedAt: updatedAt,
      rewatchCount: entry.rewatchCount ?? 0,
      rating: entry.rating ?? null,
      tags: entry.tags ?? [],
      genres: entry.genres ?? [],
      synopsis: entry.synopsis ?? null,
      notes: entry.notes ?? null,
      primaryUnitCurrent: entry.primaryUnitCurrent ?? 1,
      primaryUnitTotal: entry.primaryUnitTotal ?? null,
      secondaryUnitCurrent: entry.secondaryUnitCurrent ?? 0,
      secondaryUnitTotal: entry.secondaryUnitTotal ?? null,
      structure: entry.structure ?? [],
      coverImage: null,
      sourceId: entry.sourceId ?? null,
      createdAt: updatedAt,
      updatedAt,
    });

    if (entry.rating != null || entry.status === 'completed') {
      await db.insert(mediaActivityLogs).values({
        id: crypto.randomUUID(),
        userId,
        mediaId: id,
        actionType: entry.status === 'completed' ? 'completed' : 'rating',
        details: { title: entry.title, category: entry.category, rating: entry.rating ?? null },
        createdAt: updatedAt,
      });
    }
  }

  console.log(
    `Seeded ${DEMO_ENTRIES.length} entries for ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}).`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
