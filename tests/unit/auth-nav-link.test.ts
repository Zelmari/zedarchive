import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AuthNavLink,
  isPlainLeftClick,
  isNavigationAbortError,
} from '@/components/navigation/AuthNavLink';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('isPlainLeftClick', () => {
  it('returns true for an unmodified primary left click', () => {
    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(true);

    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
      }),
    ).toBe(true);
  });

  it('returns false when defaultPrevented is true', () => {
    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: true,
      }),
    ).toBe(false);
  });

  it('returns false for non-primary mouse buttons', () => {
    expect(
      isPlainLeftClick({
        button: 1, // Middle click
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(false);

    expect(
      isPlainLeftClick({
        button: 2, // Right click
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(false);
  });

  it('returns false when modifier keys are pressed', () => {
    const base = {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };

    expect(isPlainLeftClick({ ...base, metaKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...base, ctrlKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...base, shiftKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...base, altKey: true })).toBe(false);
  });
});

describe('isNavigationAbortError', () => {
  it('identifies DOMException and Error objects with name AbortError', () => {
    const domAbort = new DOMException('The user aborted a request.', 'AbortError');
    expect(isNavigationAbortError(domAbort)).toBe(true);

    const namedAbort = new Error('aborted');
    namedAbort.name = 'AbortError';
    expect(isNavigationAbortError(namedAbort)).toBe(true);

    expect(isNavigationAbortError({ name: 'AbortError' })).toBe(true);
  });

  it('identifies errors with fetchServerResponse or abort messages', () => {
    expect(isNavigationAbortError(new Error('Error: fetchServerResponse was aborted'))).toBe(true);
    expect(isNavigationAbortError(new Error('The operation was aborted.'))).toBe(true);
    expect(isNavigationAbortError(new Error('fetchServerResponse error: connection closed'))).toBe(
      true,
    );
    expect(isNavigationAbortError({ message: 'Request aborted by client navigation' })).toBe(true);
  });

  it('returns false for non-abort runtime and database errors', () => {
    expect(isNavigationAbortError(new Error('Connection refused'))).toBe(false);
    expect(isNavigationAbortError(new Error('Database query timed out'))).toBe(false);
    expect(isNavigationAbortError(new Error('SyntaxError: Unexpected token'))).toBe(false);
    expect(isNavigationAbortError(null)).toBe(false);
    expect(isNavigationAbortError(undefined)).toBe(false);
    expect(isNavigationAbortError('AbortError')).toBe(false);
    expect(isNavigationAbortError(404)).toBe(false);
    expect(isNavigationAbortError({})).toBe(false);
  });
});

describe('AuthNavLink static rendering', () => {
  it('renders standard auth anchor markup preserving child text', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthNavLink, { href: '/login', className: 'za-link' }, 'Sign in'),
    );

    expect(html).toContain('href="/login"');
    expect(html).toContain('class="za-link"');
    expect(html).toContain('Sign in');
  });

  it('renders primary CTA markup cleanly', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthNavLink,
        { href: '/signup', className: 'za-button za-button--primary' },
        'Get started',
      ),
    );

    expect(html).toContain('href="/signup"');
    expect(html).toContain('class="za-button za-button--primary"');
    expect(html).toContain('Get started');
  });
});
