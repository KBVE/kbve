// ---------------------------------------------------------------------------
// `deno test functions/_shared/validators.test.ts`
//
// Every function in the tree imports this module, so a regression here is a
// regression in all 19 of them at once. The SSRF guard and safeRpcError are
// the two that carry security weight: the first decides whether a worker can
// be pointed at cluster-internal addresses, the second decides what a failed
// RPC tells an anonymous caller about the database behind it.
//
// Responses are inspected by reading the body, not by trusting the status
// code — a guard that returns 400 with the driver's message still leaks.
// ---------------------------------------------------------------------------

import {
  enforceBodySizeLimit,
  rejectIllegalChars,
  requireJsonContentType,
  safeRpcError,
  validateSafeUrl,
} from "./validators.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return await res.json() as Record<string, unknown>;
}

function jsonRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://edge.test/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

// ---------------------------------------------------------------------------
// validateSafeUrl — SSRF guard
// ---------------------------------------------------------------------------

Deno.test("validateSafeUrl accepts a plain public https URL", () => {
  assertEquals(
    validateSafeUrl("https://kbve.com/hook", "url"),
    null,
    "public https",
  );
});

Deno.test("validateSafeUrl rejects http, blocking downgrade to cleartext", async () => {
  const res = validateSafeUrl("http://kbve.com", "url");
  assert(res !== null, "http must be rejected");
  assertEquals(res.status, 400, "status");
  const body = await bodyOf(res);
  assert(
    String(body.error).includes("HTTPS"),
    "error should name the scheme requirement",
  );
});

Deno.test("validateSafeUrl blocks every private range the regex claims", () => {
  // One representative per branch of PRIVATE_HOSTNAME_RE. A range that stops
  // being blocked is a path from an edge worker into the cluster.
  const blocked = [
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://127.1.2.3/x",
    "https://10.0.0.1/x",
    "https://172.16.0.1/x",
    "https://172.31.255.254/x",
    "https://192.168.1.1/x",
    "https://169.254.169.254/x", // cloud metadata endpoint
    "https://[::1]/x",
  ];
  for (const url of blocked) {
    const res = validateSafeUrl(url, "url");
    assert(res !== null, `${url} must be blocked`);
    assertEquals(res.status, 400, `${url} status`);
  }
});

Deno.test("validateSafeUrl allows public addresses adjacent to blocked ranges", () => {
  // 172.15/172.32 sit just outside the RFC1918 172.16–172.31 block, and
  // 11.x is not private at all. Over-blocking these would be a silent outage.
  for (
    const url of [
      "https://172.15.0.1/x",
      "https://172.32.0.1/x",
      "https://11.0.0.1/x",
    ]
  ) {
    assertEquals(validateSafeUrl(url, "url"), null, `${url} should pass`);
  }
});

Deno.test("validateSafeUrl enforces required vs optional", async () => {
  const missing = validateSafeUrl(undefined, "webhook");
  assert(missing !== null, "required by default");
  const body = await bodyOf(missing);
  assert(
    String(body.error).includes("webhook"),
    "error should name the field",
  );

  assertEquals(
    validateSafeUrl(undefined, "webhook", { required: false }),
    null,
    "optional undefined passes",
  );
  assertEquals(
    validateSafeUrl(null, "webhook", { required: false }),
    null,
    "optional null passes",
  );
});

Deno.test("validateSafeUrl rejects non-strings and unparseable input", () => {
  for (const bad of [42, {}, [], true]) {
    assert(
      validateSafeUrl(bad, "url") !== null,
      `${JSON.stringify(bad)} must be rejected`,
    );
  }
  assert(validateSafeUrl("not a url", "url") !== null, "garbage rejected");
});

Deno.test("validateSafeUrl rejects an over-length URL before parsing it", () => {
  const long = "https://kbve.com/" + "a".repeat(2100);
  const res = validateSafeUrl(long, "url");
  assert(res !== null, "over-length must be rejected");
  assertEquals(res.status, 400, "status");
});

// ---------------------------------------------------------------------------
// safeRpcError — the shared leak sink
// ---------------------------------------------------------------------------

Deno.test("safeRpcError withholds the driver message, code, hint and details", async () => {
  const res = safeRpcError(
    {
      message: 'relation "meme.private_table" does not exist',
      code: "42P01",
      hint: "Perhaps you meant meme.public_table",
      details: "column reporter_id referenced from constraint fk_reporter",
    },
    "service_report_meme",
  );

  const body = await bodyOf(res);
  const wire = JSON.stringify(body);

  // The generic envelope is what the caller is allowed to see.
  assertEquals(
    body.error,
    "Operation failed. Please try again or contact support.",
    "generic error text",
  );
  assertEquals(body.context, "service_report_meme", "context is retained");

  // None of the postgres-derived material may cross the wire. `hint` in
  // particular used to be returned verbatim and routinely names columns,
  // constraints and suggested values.
  assert(!("hint" in body), "hint must not be returned");
  assert(!("sqlstate" in body), "sqlstate must not be returned");
  assert(!("details" in body), "details must not be returned");
  assert(!("message" in body), "raw message must not be returned");
  assert(!wire.includes("private_table"), "must not leak a relation name");
  assert(!wire.includes("42P01"), "must not leak a sqlstate");
  assert(!wire.includes("Perhaps you meant"), "must not leak a hint");
  assert(!wire.includes("fk_reporter"), "must not leak a constraint");
});

Deno.test("safeRpcError defaults to 400 and honours an override", () => {
  assertEquals(safeRpcError({ message: "x" }, "ctx").status, 400, "default");
  assertEquals(
    safeRpcError({ message: "x" }, "ctx", 500).status,
    500,
    "override",
  );
});

Deno.test("safeRpcError copes with an error carrying only a message", async () => {
  // supabase-js does not guarantee code/hint/details are present.
  const res = safeRpcError({ message: "boom" }, "ctx");
  const body = await bodyOf(res);
  assert(!JSON.stringify(body).includes("boom"), "message withheld");
});

// ---------------------------------------------------------------------------
// enforceBodySizeLimit
// ---------------------------------------------------------------------------

Deno.test("enforceBodySizeLimit rejects an oversized content-length with 413", () => {
  const req = jsonRequest("{}", { "content-length": "1048577" });
  const res = enforceBodySizeLimit(req);
  assert(res !== null, "over limit must be rejected");
  assertEquals(res.status, 413, "status");
});

Deno.test("enforceBodySizeLimit admits the boundary and a missing header", () => {
  // Exactly at the cap is allowed; the guard is `>`, not `>=`.
  assertEquals(
    enforceBodySizeLimit(jsonRequest("{}", { "content-length": "1048576" })),
    null,
    "boundary passes",
  );
  assertEquals(
    enforceBodySizeLimit(new Request("https://edge.test/x")),
    null,
    "absent header passes",
  );
});

Deno.test("enforceBodySizeLimit ignores an unparseable content-length", () => {
  // parseInt("abc") is NaN and every NaN comparison is false, so the guard
  // falls through. Pinning it here so the fallthrough stays deliberate.
  assertEquals(
    enforceBodySizeLimit(jsonRequest("{}", { "content-length": "abc" })),
    null,
    "NaN falls through",
  );
});

// ---------------------------------------------------------------------------
// rejectIllegalChars
// ---------------------------------------------------------------------------

Deno.test("rejectIllegalChars blocks the quoting and control characters", async () => {
  const bad: Array<[string, string]> = [
    ["a%b", "percent"],
    ["a<b", "lt"],
    ["a>b", "gt"],
    ["a'b", "single quote"],
    ['a"b', "double quote"],
    ["a\\b", "backslash"],
    ["a`b", "backtick"],
    ["a\x00b", "nul"],
    ["a\x1fb", "unit separator"],
  ];
  for (const [value, label] of bad) {
    const res = rejectIllegalChars(value, "field");
    assert(res !== null, `${label} must be rejected`);
    assertEquals(res.status, 400, `${label} status`);
  }

  const res = rejectIllegalChars("a<b", "username");
  const body = await bodyOf(res!);
  assert(
    String(body.error).includes("username"),
    "error should name the field",
  );
});

Deno.test("rejectIllegalChars passes ordinary identifier text", () => {
  for (const ok of ["hello", "user_name-1", "a.b", "Ünicode", "with space"]) {
    assertEquals(rejectIllegalChars(ok, "f"), null, `${ok} should pass`);
  }
});

// ---------------------------------------------------------------------------
// requireJsonContentType
// ---------------------------------------------------------------------------

Deno.test("requireJsonContentType demands a JSON content type", () => {
  assertEquals(
    requireJsonContentType(jsonRequest("{}")),
    null,
    "application/json passes",
  );
  assertEquals(
    requireJsonContentType(
      jsonRequest("{}", { "content-type": "application/json; charset=utf-8" }),
    ),
    null,
    "charset parameter still passes",
  );

  const wrong = requireJsonContentType(
    jsonRequest("{}", { "content-type": "text/plain" }),
  );
  assert(wrong !== null, "text/plain rejected");
  assertEquals(wrong.status, 415, "status");

  assert(
    requireJsonContentType(new Request("https://edge.test/x")) !== null,
    "absent header rejected",
  );
});
