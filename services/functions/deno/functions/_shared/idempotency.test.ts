// ---------------------------------------------------------------------------
// `deno test functions/_shared/idempotency.test.ts`
//
// Guards duplicate write actions (vote.cast, server.submit). Like the rate
// limiter it holds module-level state with no reset hook, so each test uses a
// unique key.
//
// The claim is deliberately not a durable exactly-once guarantee — it only
// collapses rapid duplicates within one worker. These tests pin the contract
// it does offer, not a stronger one.
// ---------------------------------------------------------------------------

import {
  claimIdempotencyKey,
  DEFAULT_IDEMPOTENCY_TTL_MS,
  readIdempotencyKey,
} from "./idempotency.ts";

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
  return `${label}:${seq++}:${Math.random().toString(36).slice(2)}`;
}

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.test/x", { method: "POST", headers });
}

// ---------------------------------------------------------------------------
// claimIdempotencyKey
// ---------------------------------------------------------------------------

Deno.test("claimIdempotencyKey admits the first claim and rejects a repeat", () => {
  const key = uniqueKey("first");
  assertEquals(claimIdempotencyKey("vote", key), true, "first claim proceeds");
  assertEquals(claimIdempotencyKey("vote", key), false, "duplicate rejected");
  assertEquals(claimIdempotencyKey("vote", key), false, "still rejected");
});

Deno.test("claimIdempotencyKey scopes keys, so the same key is free elsewhere", () => {
  // A vote id and a server-submit id could collide; the scope prefix keeps
  // one action from swallowing the other's key.
  const key = uniqueKey("scoped");
  assertEquals(claimIdempotencyKey("vote", key), true, "claimed under vote");
  assertEquals(claimIdempotencyKey("submit", key), true, "free under submit");
});

Deno.test("claimIdempotencyKey lets a key be reclaimed after its TTL", async () => {
  const key = uniqueKey("ttl");
  assertEquals(claimIdempotencyKey("vote", key, 20), true, "first claim");
  assertEquals(claimIdempotencyKey("vote", key, 20), false, "inside the TTL");

  await new Promise((r) => setTimeout(r, 40));
  assertEquals(
    claimIdempotencyKey("vote", key, 20),
    true,
    "reclaimed after TTL",
  );
});

Deno.test("claimIdempotencyKey distinct keys never interfere", () => {
  const a = uniqueKey("a");
  const b = uniqueKey("b");
  assertEquals(claimIdempotencyKey("vote", a), true, "a claimed");
  assertEquals(claimIdempotencyKey("vote", b), true, "b claimed independently");
  assertEquals(claimIdempotencyKey("vote", a), false, "a still held");
});

Deno.test("DEFAULT_IDEMPOTENCY_TTL_MS is the documented 60s window", () => {
  assertEquals(DEFAULT_IDEMPOTENCY_TTL_MS, 60_000, "default TTL");
});

// ---------------------------------------------------------------------------
// readIdempotencyKey
// ---------------------------------------------------------------------------

Deno.test("readIdempotencyKey prefers the header over the body", () => {
  const req = requestWith({ "x-idempotency-key": "from-header" });
  assertEquals(
    readIdempotencyKey(req, { idempotency_key: "from-body" }),
    "from-header",
    "header wins",
  );
});

Deno.test("readIdempotencyKey falls back to the body key", () => {
  assertEquals(
    readIdempotencyKey(requestWith(), { idempotency_key: "from-body" }),
    "from-body",
    "body fallback",
  );
});

Deno.test("readIdempotencyKey returns null when no key is supplied", () => {
  // Idempotency is opt-in; absence must read as null rather than as a shared
  // empty-string key that would collapse unrelated writes into one.
  assertEquals(readIdempotencyKey(requestWith(), {}), null, "nothing supplied");
  assertEquals(
    readIdempotencyKey(requestWith({ "x-idempotency-key": "" }), {}),
    null,
    "empty header",
  );
  assertEquals(
    readIdempotencyKey(requestWith(), { idempotency_key: "" }),
    null,
    "empty body value",
  );
});

Deno.test("readIdempotencyKey ignores a non-string body value", () => {
  for (const bad of [42, {}, [], true, null]) {
    assertEquals(
      readIdempotencyKey(requestWith(), { idempotency_key: bad }),
      null,
      `${JSON.stringify(bad)} ignored`,
    );
  }
});

Deno.test("a key read from a request round-trips into a claim", () => {
  const value = uniqueKey("roundtrip");
  const key = readIdempotencyKey(
    requestWith({ "x-idempotency-key": value }),
    {},
  );
  assert(key !== null, "key was read");
  assertEquals(claimIdempotencyKey("vote", key), true, "first claim");
  assertEquals(claimIdempotencyKey("vote", key), false, "replay rejected");
});
