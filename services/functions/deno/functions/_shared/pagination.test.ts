// ---------------------------------------------------------------------------
// `deno test functions/_shared/pagination.test.ts`
//
// Two deliberately different styles live here: validateLimit rejects bad
// input, the clamp* helpers coerce it. Both feed row counts and offsets into
// RPCs, so a clamp that lets a huge number through is an unbounded scan.
//
// The clamp helpers use `Number(x) || fallback`, which treats 0 and NaN
// alike. That is load-bearing for clampPage (page 0 does not exist) and worth
// pinning for clampOffset (offset 0 is legitimate and must survive).
// ---------------------------------------------------------------------------

import {
  clampLimit,
  clampOffset,
  clampPage,
  validateLimit,
} from "./pagination.ts";
import { MAX_PAGE } from "./constants.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// validateLimit — strict
// ---------------------------------------------------------------------------

Deno.test("validateLimit returns the default when omitted", () => {
  for (const empty of [undefined, null]) {
    const r = validateLimit(empty);
    assertEquals(r.value, 20, "default value");
    assertEquals(r.error, null, "no error");
  }
  assertEquals(validateLimit(undefined, { def: 5 }).value, 5, "custom default");
});

Deno.test("validateLimit accepts the inclusive boundaries", () => {
  for (const n of [1, 25, 50]) {
    const r = validateLimit(n);
    assertEquals(r.value, n, `limit ${n}`);
    assertEquals(r.error, null, `limit ${n} error`);
  }
});

Deno.test("validateLimit rejects out-of-range and non-integer input", async () => {
  for (const bad of [0, -1, 51, 1.5, NaN, "abc", {}, []]) {
    const r = validateLimit(bad);
    assert(r.error !== null, `${JSON.stringify(bad)} must be rejected`);
    assertEquals(r.error.status, 400, `${JSON.stringify(bad)} status`);
    assertEquals(r.value, 20, "value falls back to the default");
  }
  const r = validateLimit(999);
  const body = await r.error!.json() as { error: string };
  assert(body.error.includes("50"), "error names the maximum");
});

Deno.test("validateLimit honours a raised maximum", () => {
  assertEquals(
    validateLimit(100, { max: 200 }).value,
    100,
    "within raised max",
  );
  assert(validateLimit(201, { max: 200 }).error !== null, "beyond raised max");
});

Deno.test("validateLimit accepts a numeric string, matching Number() coercion", () => {
  // Query strings arrive as text; "10" must not be treated as bad input.
  const r = validateLimit("10");
  assertEquals(r.value, 10, "coerced value");
  assertEquals(r.error, null, "no error");
});

// ---------------------------------------------------------------------------
// clampLimit / clampPage / clampOffset — silent coercion
// ---------------------------------------------------------------------------

Deno.test("clampLimit holds the value inside [1, max]", () => {
  const opts = { def: 20, max: 50 };
  assertEquals(clampLimit(10, opts), 10, "in range");
  assertEquals(clampLimit(0, opts), 20, "zero falls back to default");
  assertEquals(clampLimit(-5, opts), 1, "negative clamps up to 1");
  assertEquals(clampLimit(9999, opts), 50, "over max clamps down");
  assertEquals(clampLimit("abc", opts), 20, "garbage falls back to default");
  assertEquals(clampLimit(undefined, opts), 20, "undefined falls back");
});

Deno.test("clampPage is 1-based and capped at MAX_PAGE", () => {
  assertEquals(clampPage(3), 3, "in range");
  assertEquals(clampPage(0), 1, "page 0 becomes 1");
  assertEquals(clampPage(-2), 1, "negative becomes 1");
  assertEquals(clampPage("abc"), 1, "garbage becomes 1");
  assertEquals(clampPage(MAX_PAGE + 1000), MAX_PAGE, "capped at MAX_PAGE");
  assertEquals(clampPage(5, 3), 3, "explicit maxPage wins");
});

Deno.test("clampOffset preserves a legitimate zero", () => {
  // `Number(0) || 0` is 0 either way, so zero survives the falsy fallback.
  assertEquals(clampOffset(0), 0, "zero offset");
  assertEquals(clampOffset(undefined), 0, "absent offset");
  assertEquals(clampOffset(150), 150, "in range");
  assertEquals(clampOffset(-5), 0, "negative clamps to 0");
  assertEquals(
    clampOffset(1e12),
    MAX_PAGE * 1000,
    "capped to avoid a full scan",
  );
  assertEquals(clampOffset(50, 10), 10, "explicit maxOffset wins");
});

Deno.test("clamp helpers always return finite numbers", () => {
  // Whatever arrives from a JSON body, the value handed to an RPC must be a
  // real number — NaN or Infinity in a LIMIT clause is a driver-level error.
  for (const bad of [NaN, Infinity, -Infinity, "", null, {}, []]) {
    assert(
      Number.isFinite(clampLimit(bad, { def: 20, max: 50 })),
      `clampLimit(${JSON.stringify(bad)}) finite`,
    );
    assert(
      Number.isFinite(clampPage(bad)),
      `clampPage(${JSON.stringify(bad)}) finite`,
    );
    assert(
      Number.isFinite(clampOffset(bad)),
      `clampOffset(${JSON.stringify(bad)}) finite`,
    );
  }
});
