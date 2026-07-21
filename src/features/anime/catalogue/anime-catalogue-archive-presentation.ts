import type { EntryStatus } from '@/features/archive/domain/entry-status'

export type AnimeCatalogueCardArchiveState =
  | { kind: 'signed-out' }
  | { kind: 'controls-unavailable' }
  | { kind: 'can-add' }
  | { kind: 'saved'; status: EntryStatus }

export type AnimeCatalogueArchiveAccess =
  | { kind: 'signed-out' }
  | { kind: 'session-unavailable' }
  | { kind: 'controls-unavailable' }
  | {
      kind: 'memberships'
      memberships: readonly {
        catalogueItemId: string
        status: EntryStatus
      }[]
    }

export type AnimeCatalogueArchivePresentation = {
  notice: 'sign-in' | 'controls-unavailable' | null
  defaultCardState: AnimeCatalogueCardArchiveState
  cardStateByCatalogueItemId: ReadonlyMap<
    string,
    AnimeCatalogueCardArchiveState
  >
}

export function getAnimeCatalogueArchivePresentation(
  access: AnimeCatalogueArchiveAccess,
): AnimeCatalogueArchivePresentation {
  if (access.kind === 'signed-out' || access.kind === 'session-unavailable') {
    return {
      notice: 'sign-in',
      defaultCardState: { kind: 'signed-out' },
      cardStateByCatalogueItemId: new Map(),
    }
  }

  if (access.kind === 'controls-unavailable') {
    return {
      notice: 'controls-unavailable',
      defaultCardState: { kind: 'controls-unavailable' },
      cardStateByCatalogueItemId: new Map(),
    }
  }

  return {
    notice: null,
    defaultCardState: { kind: 'can-add' },
    cardStateByCatalogueItemId: new Map(
      access.memberships.map((membership) => [
        membership.catalogueItemId,
        { kind: 'saved', status: membership.status } as const,
      ]),
    ),
  }
}
