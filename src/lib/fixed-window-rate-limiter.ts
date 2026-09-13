export interface FixedWindowRateLimiterOptions {
  limit: number;
  windowMs: number;
  maxEntries: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly options: FixedWindowRateLimiterOptions;

  constructor(options: FixedWindowRateLimiterOptions) {
    if (
      !Number.isSafeInteger(options.limit) ||
      options.limit < 1 ||
      !Number.isSafeInteger(options.windowMs) ||
      options.windowMs < 1 ||
      !Number.isSafeInteger(options.maxEntries) ||
      options.maxEntries < 1
    ) {
      throw new Error("Invalid fixed-window rate limiter configuration");
    }

    this.options = options;
  }

  check(key: string, now = Date.now()): RateLimitResult {
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      if (current) this.entries.delete(key);
      return {
        allowed: true,
        remaining: this.options.limit,
        retryAfterSeconds: 0,
      };
    }

    return {
      allowed: current.count < this.options.limit,
      remaining: Math.max(0, this.options.limit - current.count),
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    };
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    const existing = this.entries.get(key);
    if (existing && existing.resetAt > now) {
      if (existing.count >= this.options.limit) return this.check(key, now);

      existing.count += 1;
      return {
        allowed: true,
        remaining: Math.max(0, this.options.limit - existing.count),
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.resetAt - now) / 1_000),
        ),
      };
    }

    if (existing) this.entries.delete(key);
    this.makeRoom(now);
    this.entries.set(key, {
      count: 1,
      resetAt: now + this.options.windowMs,
    });

    return {
      allowed: true,
      remaining: Math.max(0, this.options.limit - 1),
      retryAfterSeconds: Math.max(1, Math.ceil(this.options.windowMs / 1_000)),
    };
  }

  get size(): number {
    return this.entries.size;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private makeRoom(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }

    if (this.entries.size < this.options.maxEntries) return;

    let earliestKey: string | undefined;
    let earliestReset = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt < earliestReset) {
        earliestKey = key;
        earliestReset = entry.resetAt;
      }
    }

    if (earliestKey) this.entries.delete(earliestKey);
  }
}
