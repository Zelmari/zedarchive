import { auth } from '@/lib/auth';
import { withRequestDb } from '@/lib/db';
import { toNextJsHandler } from 'better-auth/next-js';

const { GET: authGet, POST: authPost } = toNextJsHandler(auth);

export function GET(request: Request): Promise<Response> {
  return withRequestDb(() => authGet(request));
}

export function POST(request: Request): Promise<Response> {
  return withRequestDb(() => authPost(request));
}
