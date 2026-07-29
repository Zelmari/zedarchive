export const releaseCriticalControlledFailureEnvironment =
  'M41_CONTROLLED_FAILURE'

export type ReleaseCriticalControlledFailure = 'public' | 'account'

export function readReleaseCriticalControlledFailure(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ReleaseCriticalControlledFailure | null {
  const value = environment[releaseCriticalControlledFailureEnvironment]
  if (value === undefined) return null
  if (value === 'public' || value === 'account') return value
  throw new TypeError('M41 controlled failure selector is invalid')
}

export function failReleaseCriticalIfRequested(
  target: ReleaseCriticalControlledFailure,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (readReleaseCriticalControlledFailure(environment) === target) {
    throw new Error(
      target === 'public'
        ? 'M41 controlled public failure'
        : 'M41 controlled account failure',
    )
  }
}
