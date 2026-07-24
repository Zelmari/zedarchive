import 'server-only'

import { revalidatePath } from 'next/cache'

export type UsernameChangeSession = {
  user?: { id?: string }
  session?: { id?: string }
} | null

export const usernameChangeRevalidationPaths = ['/settings'] as const

export function revalidateUsernameChangePaths(): void {
  for (const path of usernameChangeRevalidationPaths) revalidatePath(path)
  revalidatePath('/', 'layout')
}

export function getUsernameChangeSessionIdentity(
  session: UsernameChangeSession,
): { userId: string; sessionId: string } | null {
  const userId = session?.user?.id
  const sessionId = session?.session?.id

  return typeof userId === 'string' &&
    userId.length > 0 &&
    typeof sessionId === 'string' &&
    sessionId.length > 0
    ? { userId, sessionId }
    : null
}
