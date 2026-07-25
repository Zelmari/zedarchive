import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import { readDatabaseTestEnvironment } from '@/config/database-environment'
import { readAnimeCatalogueForViewer } from '@/server/database/anime-catalogue-service'
import { updateAnimeEntryDateRange } from '@/server/database/anime-entry-date-range-service'
import {
  updateAnimeEntryEpisodeProgress,
  updateAnimeEntryEpisodeTotalOverride,
} from '@/server/database/anime-entry-episode-progress-service'
import { updateAnimeEntryFavourite } from '@/server/database/anime-entry-favourite-service'
import { updateAnimeEntryRating } from '@/server/database/anime-entry-rating-service'
import { removeAnimeEntry } from '@/server/database/anime-entry-removal-service'
import {
  createAnimeEntry,
  getAnimeEntryCatalogueMembership,
  readAnimeArchivePage,
  updateAnimeEntryStatus,
} from '@/server/database/anime-entry-service'
import {
  disableUserAdultContent,
  enableUserAdultContent,
  readUserCataloguePreferences,
  setUserAnimeTitleLanguage,
} from '@/server/database/user-catalogue-preferences-service'
import {
  accountDeletionRequests,
  animeEntries,
  sessions,
  userCataloguePreferences,
  users,
} from '@/server/database/schema'
import {
  cancelUsernameChange,
  completeUsernameChange,
  preflightUsernameChange,
  readUsernameChangeState,
  requestUsernameChange,
  resendUsernameChangeCode,
} from '@/server/identity/username-change-service'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const authSecret = 'ci-disposable-better-auth-secret-32chars-min'
const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

async function createPendingSession() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const [user] = await database
    .insert(users)
    .values({
      username: `Pending${suffix}`,
      usernameIdentityKey: `pending${suffix}`,
      email: `${randomUUID()}@example.test`,
      emailVerified: true,
    })
    .returning()
  if (user === undefined) throw new Error('Expected pending user')

  const sessionId = randomUUID()
  await database.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    token: randomUUID(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  const requestedAt = new Date()
  await database.insert(accountDeletionRequests).values({
    userId: user.id,
    requestedAt,
    purgeAfter: new Date(requestedAt.getTime() + 14 * 24 * 60 * 60 * 1000),
  })
  return { user, session: { userId: user.id, sessionId } }
}

beforeAll(async () => {
  const result = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertSafeTestDatabaseName(result.rows[0]?.databaseName)
})

beforeEach(async () => {
  await pool.query(`
    truncate table
      anime_entries,
      anime_catalogue_sources,
      anime_alternative_titles,
      anime_catalogue_items,
      rate_limits,
      verifications,
      sessions,
      accounts,
      users
    restart identity cascade
  `)
})

afterAll(async () => {
  await pool.end()
})

describe('pending-account private operation inventory', () => {
  it('denies every archive, preference, personalized reader, and username root boundary without writes', async () => {
    const { user, session } = await createPendingSession()
    const fixtureId = randomUUID()

    const archiveMutations = await Promise.all([
      createAnimeEntry(database, {
        userId: user.id,
        catalogueItemId: fixtureId,
        status: 'planned',
      }),
      updateAnimeEntryStatus(database, {
        userId: user.id,
        entryId: fixtureId,
        expectedStatus: 'planned',
        requestedStatus: 'in_progress',
      }),
      updateAnimeEntryEpisodeProgress(database, {
        userId: user.id,
        entryId: fixtureId,
        expectedEpisodeProgress: 0,
        requestedEpisodeProgress: 1,
      }),
      updateAnimeEntryEpisodeTotalOverride(database, {
        userId: user.id,
        entryId: fixtureId,
        expectedEpisodeTotalOverride: null,
        requestedEpisodeTotalOverride: 12,
      }),
      updateAnimeEntryRating(database, {
        userId: user.id,
        entryId: fixtureId,
        ratingOperation: 'save',
        expectedRating: null,
        requestedRating: 8,
      }),
      updateAnimeEntryFavourite(database, {
        userId: user.id,
        entryId: fixtureId,
        expectedFavourite: false,
        requestedFavourite: true,
      }),
      updateAnimeEntryDateRange(database, {
        userId: user.id,
        entryId: fixtureId,
        expectedStartDate: null,
        expectedFinishDate: null,
        requestedStartDate: '2026-01-01',
        requestedFinishDate: null,
      }),
      removeAnimeEntry(database, { userId: user.id, entryId: fixtureId }),
    ])
    expect(archiveMutations).toEqual(
      Array.from({ length: 8 }, () => ({ kind: 'unavailable' })),
    )

    await expect(
      getAnimeEntryCatalogueMembership(database, {
        userId: user.id,
        catalogueItemIds: [fixtureId],
      }),
    ).resolves.toEqual([])
    await expect(
      readAnimeArchivePage(database, {
        userId: user.id,
        page: 1,
        pageSize: 24,
        sort: 'alphabetical',
      }),
    ).rejects.toThrow('Anime archive account is unavailable')
    await expect(
      readAnimeCatalogueForViewer(database, {
        kind: 'browse',
        userId: user.id,
        page: 1,
        pageSize: 24,
      }),
    ).rejects.toThrow('Personalized anime catalogue account is unavailable')

    await expect(
      readUserCataloguePreferences(database, { userId: user.id }),
    ).rejects.toThrow('Catalogue preferences account is unavailable')
    await expect(
      setUserAnimeTitleLanguage(database, {
        userId: user.id,
        titleLanguage: 'romaji',
      }),
    ).rejects.toThrow('Catalogue preferences account is unavailable')
    await expect(
      enableUserAdultContent(database, { userId: user.id }),
    ).rejects.toThrow('Catalogue preferences account is unavailable')
    await expect(
      disableUserAdultContent(database, { userId: user.id }),
    ).rejects.toThrow('Catalogue preferences account is unavailable')

    await expect(
      preflightUsernameChange(database, session, 'DifferentName'),
    ).resolves.toEqual({ kind: 'session_invalid' })
    await expect(
      requestUsernameChange(database, authSecret, session, 'DifferentName'),
    ).resolves.toEqual({ kind: 'session_invalid' })
    await expect(
      resendUsernameChangeCode(database, authSecret, session),
    ).resolves.toEqual({ kind: 'session_invalid' })
    await expect(cancelUsernameChange(database, session)).resolves.toEqual({
      kind: 'session_invalid',
    })
    await expect(
      completeUsernameChange(database, authSecret, session, '00000000'),
    ).resolves.toEqual({ kind: 'session_invalid' })
    await expect(readUsernameChangeState(database, session)).resolves.toEqual({
      kind: 'session_invalid',
    })

    await expect(database.select().from(animeEntries)).resolves.toEqual([])
    await expect(
      database.select().from(userCataloguePreferences),
    ).resolves.toEqual([])
  })
})
