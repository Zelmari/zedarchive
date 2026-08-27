import { vi } from 'vitest';

export function createAuthMocks() {
  const getAuthUserMock = vi.fn();
  const getSessionUserMock = vi.fn();
  const logActivityMock = vi.fn();
  const revalidatePathMock = vi.fn();
  const signInEmailMock = vi.fn();

  return {
    getAuthUserMock,
    getSessionUserMock,
    logActivityMock,
    revalidatePathMock,
    signInEmailMock,
  };
}
