import {
  parseUsernameAvailability,
  type UsernameAvailability,
} from '@/features/identity/domain/username-availability'

const usernameAvailabilityPath = '/api/usernames/availability'

export async function checkUsernameAvailability(
  username: string,
  signal?: AbortSignal,
): Promise<UsernameAvailability | null> {
  const searchParams = new URLSearchParams({ username })
  const response = await fetch(`${usernameAvailabilityPath}?${searchParams}`, {
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    return null
  }

  let body: unknown

  try {
    body = await response.json()
  } catch {
    return null
  }

  return parseUsernameAvailability(body)
}
