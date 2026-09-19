// In-memory sliding window rate limiter per Discord user
// 20 domain mutations / minute (DesignDoc §13.2)

interface RateLimitBucket {
  timestamps: number[];
}

const userMutationMap = new Map<string, RateLimitBucket>();
const MAX_MUTATIONS_PER_MINUTE = 20;
const WINDOW_MS = 60 * 1000;

export function checkMutationRateLimit(discordUserId: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  let bucket = userMutationMap.get(discordUserId);
  if (!bucket) {
    bucket = { timestamps: [] };
    userMutationMap.set(discordUserId, bucket);
  }

  // Filter out timestamps outside the sliding window
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < WINDOW_MS);

  if (bucket.timestamps.length >= MAX_MUTATIONS_PER_MINUTE) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  if (userMutationMap.size > 5000) {
    for (const [id, existing] of userMutationMap) {
      existing.timestamps = existing.timestamps.filter((ts) => now - ts < WINDOW_MS);
      if (existing.timestamps.length === 0) userMutationMap.delete(id);
    }
  }
  return { allowed: true };
}
