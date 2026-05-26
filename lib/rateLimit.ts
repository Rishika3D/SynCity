// lib/rateLimit.ts
// Simple in-memory sliding-window rate limiter for Next.js API routes.
// Limits each IP to `max` requests per `windowMs` milliseconds.

interface Window {
  count:     number;
  resetAt:   number;
}

const store = new Map<string, Window>();

export function rateLimit(ip: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const rec = store.get(ip);

  if (!rec || now > rec.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (rec.count >= max) return false; // blocked

  rec.count++;
  return true; // allowed
}
