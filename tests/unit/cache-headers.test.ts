import { describe, expect, it } from 'vitest';
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import {
  HTML_CACHE_CONTROL_SOURCE,
  HTML_CACHE_CONTROL_VALUE,
} from '../../src/lib/cache-headers.mjs';

// Same compilation as next/dist/lib/build-custom-route.js for a non-redirect:
// pathToRegexp, then modifyRouteRegex, then normalizeRouteRegex.
function compileHeaderSource(source: string) {
  const compiled = pathToRegexp(source, [], {
    strict: true,
    sensitive: false,
    delimiter: '/',
  });
  const normalized = compiled.source.replace(/\$$/, '(?:\\/)?$').replace(/\\\//g, '/');
  return new RegExp(normalized);
}

describe('HTML cache-control source', () => {
  const headerSource = compileHeaderSource(HTML_CACHE_CONTROL_SOURCE);

  it('matches pages, auth, profiles, and hashed static assets', () => {
    expect(headerSource.test('/')).toBe(true);
    expect(headerSource.test('/dashboard')).toBe(true);
    expect(headerSource.test('/settings')).toBe(true);
    expect(headerSource.test('/api/auth/get-session')).toBe(true);
    expect(headerSource.test('/u/someone')).toBe(true);
    expect(headerSource.test('/_next/static/chunk.js')).toBe(true);
  });

  it('does not match cover routes', () => {
    expect(headerSource.test('/api/covers/entry-1')).toBe(false);
    expect(headerSource.test('/api/covers/entry-1/')).toBe(false);
    expect(headerSource.test('/api/covers/entry%20with%2Fslash')).toBe(false);
  });

  it('keeps the no-cache header value', () => {
    expect(HTML_CACHE_CONTROL_VALUE).toBe('no-cache, must-revalidate');
  });
});
