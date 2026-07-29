import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveAccountAccess: vi.fn(),
  coordinate: vi.fn(),
  readAccountDeletionSetupState: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/server/auth/auth', () => ({
  resolveAccountAccess: mocks.resolveAccountAccess,
}))
vi.mock('@/features/settings/settings-page-coordinator', () => ({
  createSettingsPageCoordinator: () => mocks.coordinate,
}))
vi.mock('@/server/account-lifecycle/account-deletion-service', () => ({
  readAccountDeletionSetupState: mocks.readAccountDeletionSetupState,
}))
vi.mock('@/server/database/client', () => ({ database: {} }))
vi.mock('@/server/database/user-catalogue-preferences-service', () => ({
  readUserCataloguePreferences: vi.fn(),
}))
vi.mock('@/server/identity/username-change-service', () => ({
  readUsernameChangeState: vi.fn(),
}))
vi.mock(
  '@/features/account-deletion/components/account-deletion-forms',
  () => ({
    AccountDeletionForms: () =>
      createElement('p', null, 'Delete account controls'),
  }),
)
vi.mock(
  '@/features/settings/components/catalogue-preferences-presentation',
  () => ({
    CataloguePreferencesRouteContent: () =>
      createElement('p', null, 'Catalogue controls'),
  }),
)
vi.mock('@/features/settings/components/username-change-presentation', () => ({
  UsernameChangeRouteContent: () =>
    createElement('p', null, 'Username controls'),
}))

import SettingsPage from '@/app/settings/page'

describe('SettingsPage', () => {
  beforeEach(() => {
    mocks.resolveAccountAccess.mockResolvedValue({
      status: 'active',
      session: { user: { id: 'user-id' }, session: { id: 'session-id' } },
    })
    mocks.coordinate.mockResolvedValue({
      kind: 'available',
      catalogue: { kind: 'available', preferences: {} },
      username: { kind: 'available', username: 'CurrentName' },
    })
    mocks.readAccountDeletionSetupState.mockResolvedValue({ kind: 'available' })
  })

  it('places the exact archive-download copy and native link between username and deletion controls', async () => {
    const markup = renderToStaticMarkup(await SettingsPage())
    const username = markup.indexOf('Username')
    const archiveData = markup.indexOf('Archive data')
    const deleteAccount = markup.indexOf('Delete account')

    expect(username).toBeGreaterThan(-1)
    expect(archiveData).toBeGreaterThan(username)
    expect(deleteAccount).toBeGreaterThan(archiveData)
    expect(markup).toContain(
      'Download a JSON copy of your saved anime tracking data and catalogue preferences. It excludes your account identity, sign-in information, and images.',
    )
    expect(markup).toContain(
      'The JSON file contains your complete saved anime data, including entries currently hidden by your adult-content setting. Store it somewhere private.',
    )
    expect(markup).toContain('za-notice za-notice--information')
    expect(markup).toContain('href="/api/account/archive-backup"')
    expect(markup).toContain('Download archive backup (JSON)')
    expect(markup).toContain('za-container za-container--medium')
    expect(markup).toContain('za-card za-card--raised space-y-6')
    expect(markup).toContain(
      'za-card za-card--raised space-y-4 border-destructive',
    )
    expect(markup).toContain('za-button za-button--secondary')
  })
})
