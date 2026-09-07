// ---------------------------------------------------------------------------
// `deno test functions/_shared/cors.test.ts`
//
// The allowlist decides which sites may make credentialed browser requests to
// every edge function. The failure that matters is reflecting an arbitrary
// Origin back — that turns the allowlist into a no-op, so several tests below
// assert on the *absence* of the header rather than on a value.
// ---------------------------------------------------------------------------

import { corsHeaders, getCorsHeaders, preflight, withCors } from "./cors.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function withOrigin(origin?: string): Request {
  return new Request(
    "https://edge.test/x",
    origin ? { headers: { origin } } : undefined,
  );
}

const ALLOWED = "https://kbve.com";

Deno.test("getCorsHeaders echoes an allowlisted origin", () => {
  for (
    const origin of [ALLOWED, "https://app.kbve.com", "http://localhost:4321"]
  ) {
    assertEquals(
      getCorsHeaders(withOrigin(origin))["Access-Control-Allow-Origin"],
      origin,
      origin,
    );
  }
});

Deno.test("getCorsHeaders omits the header for an unknown origin", () => {
  // Omitted, never "null" or "*" — a present header with a wrong value is
  // still a header the browser will evaluate.
  for (
    const origin of [
      "https://evil.com",
      "https://kbve.com.evil.com",
      "https://notkbve.com",
      "http://kbve.com", // scheme must match the allowlist entry exactly
    ]
  ) {
    const headers = getCorsHeaders(withOrigin(origin));
    assert(
      !("Access-Control-Allow-Origin" in headers),
      `${origin} must not be echoed`,
    );
  }
});

Deno.test("getCorsHeaders omits the header when no origin is sent", () => {
  assert(
    !("Access-Control-Allow-Origin" in getCorsHeaders(withOrigin())),
    "absent origin",
  );
  assert(
    !("Access-Control-Allow-Origin" in getCorsHeaders()),
    "no request at all",
  );
});

Deno.test("getCorsHeaders never emits a wildcard origin", () => {
  // A wildcard cannot be combined with credentials, and would defeat the
  // allowlist entirely.
  for (const origin of [ALLOWED, "https://evil.com", undefined]) {
    const value =
      getCorsHeaders(withOrigin(origin))["Access-Control-Allow-Origin"];
    assert(value !== "*", `wildcard for ${origin}`);
  }
});

Deno.test("base headers carry the methods, headers and Vary", () => {
  // Vary: Origin is what keeps a CDN from caching one origin's allow header
  // and serving it to another.
  assertEquals(corsHeaders["Vary"], "Origin", "Vary");
  assert(
    corsHeaders["Access-Control-Allow-Methods"].includes("POST"),
    "POST allowed",
  );
  assert(
    corsHeaders["Access-Control-Allow-Headers"].includes("authorization"),
    "authorization allowed",
  );
  assert(
    corsHeaders["Access-Control-Allow-Headers"].includes("x-idempotency-key"),
    "idempotency header allowed",
  );
  assert(
    !("Access-Control-Allow-Origin" in corsHeaders),
    "baseline carries no origin",
  );
});

Deno.test("withCors preserves status, body and existing headers", async () => {
  const original = new Response(JSON.stringify({ ok: true }), {
    status: 418,
    headers: { "content-type": "application/json", "x-custom": "kept" },
  });
  const merged = withCors(original, withOrigin(ALLOWED));

  assertEquals(merged.status, 418, "status preserved");
  assertEquals(merged.headers.get("x-custom"), "kept", "custom header kept");
  assertEquals(
    merged.headers.get("Access-Control-Allow-Origin"),
    ALLOWED,
    "origin merged in",
  );
  const body = await merged.json() as { ok: boolean };
  assertEquals(body.ok, true, "body preserved");
});

Deno.test("withCors does not attach an origin for a disallowed caller", () => {
  const merged = withCors(new Response("x"), withOrigin("https://evil.com"));
  assertEquals(
    merged.headers.get("Access-Control-Allow-Origin"),
    null,
    "no origin header",
  );
});

Deno.test("preflight answers OPTIONS with the origin-aware headers", () => {
  const ok = preflight(withOrigin(ALLOWED));
  assertEquals(ok.status, 200, "status");
  assertEquals(
    ok.headers.get("Access-Control-Allow-Origin"),
    ALLOWED,
    "allowlisted origin echoed",
  );

  const denied = preflight(withOrigin("https://evil.com"));
  assertEquals(
    denied.headers.get("Access-Control-Allow-Origin"),
    null,
    "unknown origin gets no allow header",
  );
});
