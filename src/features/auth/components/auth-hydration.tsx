'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

const subscribeToHydration = () => () => undefined
const getHydratedSnapshot = () => true
const getServerHydrationSnapshot = () => false

export function useAuthHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  )
}

export function AuthNoScriptNotice({ children }: { children: ReactNode }) {
  return (
    <noscript>
      <p className="za-notice za-notice--information">{children}</p>
    </noscript>
  )
}
