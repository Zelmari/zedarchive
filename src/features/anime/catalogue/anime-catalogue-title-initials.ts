const TITLE_INITIAL_PATTERN = /[\p{L}\p{N}]/u

function uppercaseFirstCodePoint(value: string): string {
  return Array.from(value.toLocaleUpperCase('en'))[0]!
}

export function getAnimeCatalogueTitleInitials(title: string): string {
  const normalizedTitle = title.trim()

  if (normalizedTitle.length === 0) {
    throw new Error('Anime catalogue title must not be empty')
  }

  const initials: string[] = []

  for (const token of normalizedTitle.split(/\s+/u)) {
    const candidate = token.match(TITLE_INITIAL_PATTERN)?.[0]

    if (candidate === undefined) {
      continue
    }

    initials.push(uppercaseFirstCodePoint(candidate))

    if (initials.length === 2) {
      break
    }
  }

  if (initials.length > 0) {
    return initials.join('')
  }

  return Array.from(normalizedTitle)[0]!
}
