import 'server-only'

export type CurrentPasswordVerification =
  | { kind: 'verified' }
  | { kind: 'invalid_password' }
  | { kind: 'session_invalid' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }

type AuthHandler = Readonly<{
  handler(request: Request): Promise<Response>
}>

function copyHeader(
  source: Headers,
  destination: Headers,
  name: 'cookie' | 'origin' | 'referer',
): void {
  const value = source.get(name)
  if (value !== null) destination.set(name, value)
}

/**
 * Runs the pinned provider endpoint through its router rather than calling
 * auth.api directly, preserving its authoritative-session, CSRF and shared
 * database rate-limit boundary. IP forwarding remains intentionally disabled
 * until the production proxy decision at Gate G.
 */
export async function verifyCurrentPassword(
  auth: AuthHandler,
  authUrl: string,
  sourceHeaders: Headers,
  password: string,
): Promise<CurrentPasswordVerification> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  copyHeader(sourceHeaders, headers, 'cookie')
  copyHeader(sourceHeaders, headers, 'origin')
  copyHeader(sourceHeaders, headers, 'referer')

  let response: Response
  try {
    response = await auth.handler(
      new Request(`${authUrl}/api/auth/verify-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ password }),
      }),
    )
  } catch {
    return { kind: 'unavailable' }
  }

  if (response.status === 200) return { kind: 'verified' }
  if (response.status === 400) return { kind: 'invalid_password' }
  if (response.status === 401 || response.status === 403) {
    return { kind: 'session_invalid' }
  }
  if (response.status === 429) return { kind: 'rate_limited' }
  return { kind: 'unavailable' }
}
