/**
 * In-memory sliding-window rate limiter.
 *
 * Per-worker only — state does not persist across worker restarts or span
 * multiple worker instances. This mirrors the existing in-memory ownership
 * cache in guild-vault and is sufficient to blunt single-worker abuse; a
 * durable limiter (Valkey) is a future upgrade.
 */

import { jsonResponse } from "./supabase.ts";

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, win] of buckets) {
    if (win.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Register a request against `key`. Returns a 429 Response when the caller has
 * exceeded `limit` within `windowMs`, otherwise null.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): Response | null {
  const now = Date.now();
  sweep(now);

  const win = buckets.get(key);
  if (!win || win.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  win.count++;
  if (win.count > limit) {
    const retryAfter = Math.ceil((win.resetAt - now) / 1000);
    return jsonResponse(
      { error: "Rate limit exceeded. Try again later." },
      429,
    );
  }
  return null;
}

/**
 * Derive a stable rate-limit key from a request, preferring the authenticated
 * user id, then a forwarded client IP, then a constant fallback.
 */
export function rateLimitKey(
  scope: string,
  req: Request,
  userId?: string,
): string {
  if (userId) return `${scope}:user:${userId}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${scope}:ip:${ip}`;
}
