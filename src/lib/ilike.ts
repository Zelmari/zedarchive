/**
 * Escape `\`, `%`, and `_` so user input is matched literally in Postgres ILIKE.
 * PostgreSQL treats `\` as the default LIKE escape character.
 */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function ilikeContainsPattern(raw: string): string {
  return `%${escapeIlikePattern(raw)}%`;
}
