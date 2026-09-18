import { describe, it, expect } from 'vitest';
import { escapeIlikePattern, ilikeContainsPattern } from '@/lib/ilike';

describe('escapeIlikePattern', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeIlikePattern('100%_done\\x')).toBe('100\\%\\_done\\\\x');
  });

  it('wraps a contains-pattern without treating user % as a wildcard', () => {
    expect(ilikeContainsPattern('%')).toBe('%\\%%');
    expect(ilikeContainsPattern('a_b')).toBe('%a\\_b%');
  });
});
