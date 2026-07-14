/**
 * In-memory idempotency guard for write actions (vote.cast, server.submit).
 *
 * Per-worker only — collapses duplicate submissions that arrive in quick
 * succession with the same idempotency key. Not a durable exactly-once
 * guarantee; the DB RPCs remain the source of truth for true uniqueness.
 */

interface Entry {
  expiresAt: number;
}

const seen = new Map<string, Entry>();
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, entry] of seen) {
    if (entry.expiresAt <= now) seen.delete(key);
  }
}

/** Default idempotency window (60s). */
export const DEFAULT_IDEMPOTENCY_TTL_MS = 60_000;

/**
 * Read an idempotency key from the request header or body. Returns null when no
 * key is supplied (idempotency is opt-in).
 */
export function readIdempotencyKey(
  req: Request,
  body: Record<string, unknown>,
): string | null {
  const header = req.headers.get("x-idempotency-key");
  if (header && header.length > 0) return header;
  const fromBody = body.idempotency_key;
  return typeof fromBody === "string" && fromBody.length > 0 ? fromBody : null;
}

/**
 * Mark `key` as in-flight for `scope`. Returns true if this is the first time
 * the key has been seen within the TTL (caller should proceed), false if it is
 * a duplicate (caller should reject).
 */
export function claimIdempotencyKey(
  scope: string,
  key: string,
  ttlMs: number = DEFAULT_IDEMPOTENCY_TTL_MS,
): boolean {
  const now = Date.now();
  sweep(now);
  const composite = `${scope}:${key}`;
  const existing = seen.get(composite);
  if (existing && existing.expiresAt > now) return false;
  seen.set(composite, { expiresAt: now + ttlMs });
  return true;
}
