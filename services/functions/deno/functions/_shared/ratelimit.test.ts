// ---------------------------------------------------------------------------
// `deno test functions/_shared/ratelimit.test.ts`
//
// The limiter keeps its buckets in a module-level Map with no reset export,
// so every test below uses a unique key. Sharing a key between tests would
// couple them to execution order.
//
// This is the only thing standing between an unauthenticated caller and an
// unbounded request rate on a worker, so the off-by-one at the limit boundary
// and the key-derivation precedence both matter.
// ---------------------------------------------------------------------------

import { rateLimit, rateLimitKey, type RateLimitOptions } from "./ratelimit.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

let seq = 0;
function uniqueKey(label: string): string {
  return `test:${label}:${seq++}:${Math.random().toString(36).slice(2)}`;
}

const wide: RateLimitOptions = { limit: 3, windowMs: 60_000 };

function requestWith(headers: Record<string, string>): Request {
  return new Request("https://edge.test/x", { headers });
}

Deno.test("rateLimit allows exactly `limit` requests, then blocks", () => {
  const key = uniqueKey("boundary");
  for (let i = 1; i <= 3; i++) {
    assertEquals(rateLimit(key, wide), null, `request ${i} allowed`);
  }
  const blocked = rateLimit(key, wide);
  assert(blocked !== null, "the 4th request is blocked");
  assertEquals(blocked.status, 429, "status");
});

Deno.test("rateLimit keeps blocking once the window is exhausted", () => {
  const key = uniqueKey("stays-blocked");
  for (let i = 0; i < 3; i++) rateLimit(key, wide);
  for (let i = 0; i < 5; i++) {
    assert(rateLimit(key, wide) !== null, "still blocked");
  }
});

Deno.test("rateLimit buckets are independent per key", () => {
  const a = uniqueKey("iso-a");
  const b = uniqueKey("iso-b");
  for (let i = 0; i < 3; i++) rateLimit(a, wide);
  assert(rateLimit(a, wide) !== null, "a is exhausted");
  assertEquals(rateLimit(b, wide), null, "b is unaffected");
});

Deno.test("rateLimit starts a fresh window after the old one expires", async () => {
  const key = uniqueKey("expiry");
  const brief: RateLimitOptions = { limit: 1, windowMs: 20 };

  assertEquals(rateLimit(key, brief), null, "first request allowed");
  assert(rateLimit(key, brief) !== null, "second blocked inside the window");

  await new Promise((r) => setTimeout(r, 40));
  assertEquals(rateLimit(key, brief), null, "allowed again after expiry");
});

Deno.test("rateLimit response body does not describe the limiter's state", async () => {
  // The 429 should not tell a caller the window length or their exact count;
  // that is tuning information for whoever is probing the endpoint.
  const key = uniqueKey("opaque");
  const opts: RateLimitOptions = { limit: 1, windowMs: 60_000 };
  rateLimit(key, opts);
  const blocked = rateLimit(key, opts);
  assert(blocked !== null, "blocked");
  const body = await blocked.json() as Record<string, unknown>;
  assertEquals(
    body.error,
    "Rate limit exceeded. Try again later.",
    "generic message",
  );
  const wire = JSON.stringify(body);
  assert(!wire.includes("60000"), "window length withheld");
  assert(!wire.includes(key), "key withheld");
});

// ---------------------------------------------------------------------------
// rateLimitKey
// ---------------------------------------------------------------------------

Deno.test("rateLimitKey prefers the authenticated user over any header", () => {
  const req = requestWith({
    "x-forwarded-for": "1.2.3.4",
    "x-real-ip": "5.6.7.8",
  });
  assertEquals(
    rateLimitKey("meme", req, "user-123"),
    "meme:user:user-123",
    "user id wins",
  );
});

Deno.test("rateLimitKey falls back through forwarded-for, real-ip, unknown", () => {
  assertEquals(
    rateLimitKey("s", requestWith({ "x-forwarded-for": "1.2.3.4" })),
    "s:ip:1.2.3.4",
    "forwarded-for",
  );
  assertEquals(
    rateLimitKey("s", requestWith({ "x-real-ip": "5.6.7.8" })),
    "s:ip:5.6.7.8",
    "real-ip when forwarded-for is absent",
  );
  assertEquals(
    rateLimitKey("s", requestWith({})),
    "s:ip:unknown",
    "constant fallback",
  );
});

Deno.test("rateLimitKey takes the client hop from a forwarded-for chain", () => {
  // x-forwarded-for accumulates proxies left-to-right; the leftmost entry is
  // the original client. Taking a later hop would bucket every caller behind
  // one proxy together.
  assertEquals(
    rateLimitKey(
      "s",
      requestWith({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" }),
    ),
    "s:ip:1.2.3.4",
    "leftmost hop",
  );
  assertEquals(
    rateLimitKey(
      "s",
      requestWith({ "x-forwarded-for": "  1.2.3.4  , 10.0.0.1" }),
    ),
    "s:ip:1.2.3.4",
    "whitespace trimmed",
  );
});

Deno.test("rateLimitKey separates scopes for the same caller", () => {
  const req = requestWith({ "x-forwarded-for": "1.2.3.4" });
  assert(
    rateLimitKey("meme", req) !== rateLimitKey("forum", req),
    "scopes must not share a bucket",
  );
});
