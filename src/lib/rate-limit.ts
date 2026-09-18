interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Map<string, RateLimitBucket>>();

export function checkRateLimit(
  namespace: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  let map = buckets.get(namespace);
  if (!map) {
    map = new Map();
    buckets.set(namespace, map);
  }
  const bucket = map.get(key);
  if (!bucket || now >= bucket.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function clientKeyFromRequest(request: Request): string {
  const forwarded =
    request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}
