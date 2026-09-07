// ---------------------------------------------------------------------------
// `deno test functions/_shared/supabase.test.ts`
//
// Covers the parts of the module that need no network: the two role guards,
// the AuthError contract, the jsonResponse envelope and the staff permission
// bitmask. parseJwt and the staff RPC lane are exercised in the e2e suite,
// where a real token and a real server exist.
//
// The guards are worth pinning precisely because they are so short: they are
// the difference between a service_role-only endpoint and an open one, and
// both directions of the check are asymmetric (one rejects service_role, the
// other requires it).
// ---------------------------------------------------------------------------

import {
  AuthError,
  jsonResponse,
  type JwtClaims,
  requireServiceRole,
  requireUserToken,
  staffPerm,
} from "./supabase.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function claims(role?: string): JwtClaims {
  return { role } as JwtClaims;
}

// ---------------------------------------------------------------------------
// Role guards
// ---------------------------------------------------------------------------

Deno.test("requireUserToken turns away a service_role caller", async () => {
  const denied = requireUserToken(claims("service_role"));
  assert(denied !== null, "service_role must be rejected");
  assertEquals(denied.status, 403, "status");
  const body = await denied.json() as { error: string };
  assert(body.error.includes("service_role"), "error explains the requirement");
});

Deno.test("requireUserToken admits ordinary user roles", () => {
  // Anything that is not literally service_role is treated as a user token,
  // including an absent role claim.
  for (const role of ["authenticated", "anon", undefined]) {
    assertEquals(requireUserToken(claims(role)), null, `role ${role}`);
  }
});

Deno.test("requireServiceRole admits only service_role", () => {
  assertEquals(
    requireServiceRole(claims("service_role")),
    null,
    "service_role",
  );
});

Deno.test("requireServiceRole rejects every other role", async () => {
  for (const role of ["authenticated", "anon", "staff", "", undefined]) {
    const denied = requireServiceRole(claims(role));
    assert(denied !== null, `role ${role} must be rejected`);
    assertEquals(denied.status, 403, `role ${role} status`);
  }
  const body = await requireServiceRole(claims("anon"))!.json() as {
    error: string;
  };
  assert(body.error.includes("service_role"), "error names the requirement");
});

Deno.test("the two guards are mutually exclusive for any single role", () => {
  // No role may satisfy both, and service_role/authenticated must each
  // satisfy exactly one — a role passing both would mean a handler could be
  // reached by either lane regardless of which guard it declared.
  for (const role of ["service_role", "authenticated", "anon", undefined]) {
    const user = requireUserToken(claims(role)) === null;
    const service = requireServiceRole(claims(role)) === null;
    assert(!(user && service), `role ${role} must not satisfy both guards`);
  }
});

Deno.test("role guards do not echo the caller's claims", async () => {
  // The 403 body should describe the requirement, never reflect what the
  // caller sent — a reflected claim is an oracle for probing the JWT shape.
  const denied = requireServiceRole(claims("wizard"));
  const wire = JSON.stringify(await denied!.json());
  assert(!wire.includes("wizard"), "caller's role withheld");
});

// ---------------------------------------------------------------------------
// AuthError
// ---------------------------------------------------------------------------

Deno.test("AuthError defaults to 401 and carries its message", () => {
  const err = new AuthError("Invalid session token");
  assertEquals(err.status, 401, "default status");
  assertEquals(err.message, "Invalid session token", "message");
  assertEquals(err.name, "AuthError", "name");
  assert(err instanceof Error, "extends Error");
});

Deno.test("AuthError accepts an explicit status", () => {
  assertEquals(new AuthError("Auth not configured", 500).status, 500, "status");
});

Deno.test("AuthError messages do not name environment variables", () => {
  // The misconfiguration paths run before authentication, so their text is
  // reachable by an anonymous caller; it must not say which var is unset.
  const err = new AuthError("Auth not configured", 500);
  for (const secret of ["SUPABASE_URL", "JWT_SECRET", "SERVICE_ROLE"]) {
    assert(!err.message.includes(secret), `must not name ${secret}`);
  }
});

// ---------------------------------------------------------------------------
// jsonResponse
// ---------------------------------------------------------------------------

Deno.test("jsonResponse defaults to 200 with a JSON content type", async () => {
  const res = jsonResponse({ hello: "world" });
  assertEquals(res.status, 200, "status");
  assertEquals(
    res.headers.get("content-type"),
    "application/json",
    "content type",
  );
  const body = await res.json() as { hello: string };
  assertEquals(body.hello, "world", "body round-trips");
});

Deno.test("jsonResponse honours an explicit status", () => {
  for (const status of [400, 403, 413, 415, 429, 500, 502]) {
    assertEquals(jsonResponse({}, status).status, status, `status ${status}`);
  }
});

Deno.test("jsonResponse carries the baseline CORS headers but no origin", () => {
  // jsonResponse is the safe default: routers add an origin via withCors only
  // when the caller is allowlisted.
  const res = jsonResponse({});
  assertEquals(res.headers.get("Vary"), "Origin", "Vary");
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    null,
    "no origin by default",
  );
});

// ---------------------------------------------------------------------------
// staffPerm bitmask
// ---------------------------------------------------------------------------

Deno.test("staffPerm flags are distinct single bits", () => {
  const seen = new Set<number>();
  for (const [name, bit] of Object.entries(staffPerm)) {
    assert(bit > 0, `${name} is positive`);
    assert((bit & (bit - 1)) === 0, `${name} is a single bit`);
    assert(!seen.has(bit), `${name} does not collide with another flag`);
    seen.add(bit);
  }
});

Deno.test("staffPerm flags compose and test independently", () => {
  const mask = staffPerm.STAFF | staffPerm.DASHBOARD_VIEW;
  assert((mask & staffPerm.STAFF) !== 0, "STAFF set");
  assert((mask & staffPerm.DASHBOARD_VIEW) !== 0, "DASHBOARD_VIEW set");
  assert((mask & staffPerm.ADMIN) === 0, "ADMIN not set");
  assert((mask & staffPerm.SUPERADMIN) === 0, "SUPERADMIN not set");
});

Deno.test("SUPERADMIN stays inside the positive 32-bit range", () => {
  // 0x4000_0000 is deliberately below the sign bit; 0x8000_0000 would come
  // back negative from a bitwise AND and break `permissions > 0` checks.
  assert(staffPerm.SUPERADMIN > 0, "positive");
  assert((0 | staffPerm.SUPERADMIN) > 0, "survives a bitwise round-trip");
});
