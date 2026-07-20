export const verifyEmailTokenMaximumLength = 2048

export type VerifyEmailTokenSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>

export type VerifyEmailTokenParseResult =
  { kind: 'valid'; token: string } | { kind: 'invalid' }

type ScalarParamResult =
  { kind: 'absent' } | { kind: 'value'; value: string } | { kind: 'repeated' }

function getScalarParam(
  searchParams: VerifyEmailTokenSearchParams,
  key: string,
): ScalarParamResult {
  const raw = searchParams[key]

  if (raw === undefined) {
    return { kind: 'absent' }
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return { kind: 'absent' }
    }

    if (raw.length > 1) {
      return { kind: 'repeated' }
    }

    return { kind: 'value', value: raw[0]! }
  }

  return { kind: 'value', value: raw }
}

function isBoundedNonEmptyToken(value: string): boolean {
  if (value.length === 0 || value.trim().length === 0) {
    return false
  }

  return value.length <= verifyEmailTokenMaximumLength
}

export function parseVerifyEmailToken(
  searchParams: VerifyEmailTokenSearchParams,
): VerifyEmailTokenParseResult {
  const tokenParam = getScalarParam(searchParams, 'token')

  if (tokenParam.kind !== 'value') {
    return { kind: 'invalid' }
  }

  if (!isBoundedNonEmptyToken(tokenParam.value)) {
    return { kind: 'invalid' }
  }

  return {
    kind: 'valid',
    token: tokenParam.value,
  }
}
