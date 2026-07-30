export const releaseCriticalControlledFailureEnvironment =
  'M41_CONTROLLED_FAILURE'

export type ReleaseCriticalControlledFailure =
  | 'public'
  | 'account'
  | 'archive-tracking'
  | 'archive-backup'
  | 'account-restriction'

export function readReleaseCriticalControlledFailure(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ReleaseCriticalControlledFailure | null {
  const value = environment[releaseCriticalControlledFailureEnvironment]
  if (value === undefined) return null
  if (
    value === 'public' ||
    value === 'account' ||
    value === 'archive-tracking' ||
    value === 'archive-backup' ||
    value === 'account-restriction'
  ) {
    return value
  }
  throw new TypeError('M41 controlled failure selector is invalid')
}

export function failReleaseCriticalIfRequested(
  target: ReleaseCriticalControlledFailure,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (readReleaseCriticalControlledFailure(environment) === target) {
    throw new Error(`M42 controlled ${target} failure`)
  }
}
