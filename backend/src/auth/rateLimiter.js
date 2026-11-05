/**
 * In-memory sliding-window rate limiter middleware for PMPilot
 * 
 * Provides brute-force and abuse protection for sensitive endpoints
 * (e.g. login, registration) without requiring external services like Redis.
 */

class SlidingWindowRateLimiter {
  constructor({ windowMs = 60 * 1000, max = 15, message = 'Too many requests. Please try again later.' } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.message = message;
    this.hits = new Map();

    // Prune stale keys every 2 minutes
    this.pruneInterval = setInterval(() => this.prune(), 2 * 60 * 1000);
    if (this.pruneInterval.unref) {
      this.pruneInterval.unref();
    }
  }

  prune() {
    const now = Date.now();
    for (const [key, timestamps] of this.hits.entries()) {
      const active = timestamps.filter(t => now - t < this.windowMs);
      if (active.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, active);
      }
    }
  }

  middleware() {
    return (req, res, next) => {
      // In automated test environments with mocked or high-speed calls, rate limiting can be disabled
      if (process.env.NODE_ENV === 'test' && process.env.DISABLE_RATE_LIMIT === 'true') {
        return next();
      }

      const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
      const key = `${ip}:${req.path}`;
      const now = Date.now();

      const timestamps = this.hits.get(key) || [];
      const windowStart = now - this.windowMs;
      const recentTimestamps = timestamps.filter(t => t > windowStart);

      if (recentTimestamps.length >= this.max) {
        const oldestRecent = recentTimestamps[0];
        const retryAfterSeconds = Math.ceil((oldestRecent + this.windowMs - now) / 1000);
        res.setHeader('Retry-After', retryAfterSeconds > 0 ? retryAfterSeconds : 1);
        return res.status(429).json({
          success: false,
          error: this.message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: retryAfterSeconds > 0 ? retryAfterSeconds : 1
        });
      }

      recentTimestamps.push(now);
      this.hits.set(key, recentTimestamps);
      next();
    };
  }
}

export function createRateLimiter(options) {
  const limiter = new SlidingWindowRateLimiter(options);
  return limiter.middleware();
}
