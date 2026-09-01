import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { POST } from '@/app/api/assets/upload/route';

const VALID_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('POST /api/assets/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('rejects unauthenticated requests', async () => {
    getSessionMock.mockResolvedValue(null);
    const req = new Request('http://localhost/api/assets/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: VALID_PNG_BASE64 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('accepts valid PNG image and returns WebP data URI', async () => {
    const req = new Request('http://localhost/api/assets/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: VALID_PNG_BASE64 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.url).toMatch(/^data:image\/webp;base64,/);
  });

  it('rejects non-image payload with spoofed MIME prefix', async () => {
    const fakeImage =
      'data:image/png;base64,' + Buffer.from('not a real png content').toString('base64');
    const req = new Request('http://localhost/api/assets/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: fakeImage }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid image content');
  });

  it('rejects empty or missing payload', async () => {
    const req = new Request('http://localhost/api/assets/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: '' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
