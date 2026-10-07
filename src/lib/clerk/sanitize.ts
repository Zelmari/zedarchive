/**
 * Characters that must not ride along in a sentence or a title.
 * Zero-width, word joiner, variation selectors, and the tag block.
 */
const HIDDEN = /[\u200B-\u200D\u2060\uFE00-\uFE0F\u{E0000}-\u{E007F}]/gu;

export function stripHiddenCharacters(value: string): string {
  return value.replace(HIDDEN, '');
}
