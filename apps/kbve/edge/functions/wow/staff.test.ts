// ---------------------------------------------------------------------------
// `deno test --allow-env --allow-net functions/wow/staff.test.ts`
//
// staff.ts reaches Supabase through module-scoped clients built at import
// time, so the environment has to be in place before the module is pulled in —
// hence the dynamic import below rather than a static one. The URL points at a
// closed port on purpose: staff_permissions() failing is exactly the "caller
// is not staff" outcome these cases need, with no network dependency.
// ---------------------------------------------------------------------------

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:1");
Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.delete("TC9_MYSQL_USER");
Deno.env.delete("TC9_MYSQL_PASSWORD");

const {
  buildAccountsQuery,
  clampLimit,
  handleStaff,
  normalizeSearch,
  parseOffset,
  STAFF_ACTIONS,
  validateAccountId,
  validateGmLevel,
} = await import("./staff.ts");

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function request(
  action: string,
  body: Record<string, unknown> = {},
  role = "authenticated",
) {
  return {
    token: "not-a-real-token",
    claims: { role, sub: "11111111-2222-3333-4444-555555555555" },
    body,
    action,
  };
}

Deno.test("every declared action is routable", () => {
  const expected = [
    "realm_status",
    "online_characters",
    "accounts",
    "set_gm_level",
    "ban_account",
    "unban_account",
  ];
  assertEquals(
    STAFF_ACTIONS.join(","),
    expected.join(","),
    "STAFF_ACTIONS",
  );
});

Deno.test("unknown action is rejected before the staff lookup", async () => {
  const res = await handleStaff(request("drop_everything"));
  assertEquals(res.status, 400, "status");
});

Deno.test("non-staff caller gets 403 on every action", async () => {
  for (const action of STAFF_ACTIONS) {
    const res = await handleStaff(request(action, { account_id: 1, level: 1 }));
    assertEquals(res.status, 403, `${action} status`);
    const body = await res.json();
    assert(
      String(body.error).includes("Access denied"),
      `${action} should report an access denial, got ${body.error}`,
    );
  }
});

Deno.test("staff caller gets a machine-readable 503 when MySQL is unset", async () => {
  for (const action of STAFF_ACTIONS) {
    const res = await handleStaff(
      request(action, { account_id: 1, level: 1 }, "service_role"),
    );
    assertEquals(res.status, 503, `${action} status`);
    const body = await res.json();
    assertEquals(body.code, "mysql_unconfigured", `${action} code`);
    assert(!("stack" in body), `${action} must not leak a stack`);
  }
});

Deno.test("limit is clamped and defaulted", () => {
  assertEquals(clampLimit(undefined), 25, "default");
  assertEquals(clampLimit(null), 25, "null");
  assertEquals(clampLimit(0), 25, "zero");
  assertEquals(clampLimit(-5), 25, "negative");
  assertEquals(clampLimit(1.5), 25, "fractional");
  assertEquals(clampLimit("abc"), 25, "non-numeric");
  assertEquals(clampLimit(10), 10, "in range");
  assertEquals(clampLimit(100), 100, "at cap");
  assertEquals(clampLimit(1000), 100, "over cap");
  assertEquals(clampLimit(Number.MAX_SAFE_INTEGER), 100, "absurd");
});

Deno.test("offset must be a non-negative integer", () => {
  assertEquals(parseOffset(undefined), 0, "default");
  assertEquals(parseOffset(0), 0, "zero");
  assertEquals(parseOffset(50), 50, "positive");
  for (const bad of [-1, 2.5, "10; DROP TABLE account", {}]) {
    const res = parseOffset(bad);
    assert(
      res instanceof Response,
      `${JSON.stringify(bad)} should be rejected`,
    );
    assertEquals((res as Response).status, 400, "status");
  }
});

Deno.test("gm level is restricted to 0..3", () => {
  for (const ok of [0, 1, 2, 3]) {
    assertEquals(validateGmLevel(ok), ok, `level ${ok}`);
  }
  for (const bad of [-1, 4, 99, 1.5, "3", null, undefined, "admin"]) {
    const res = validateGmLevel(bad);
    assert(res instanceof Response, `${String(bad)} should be rejected`);
    assertEquals((res as Response).status, 400, "status");
  }
});

Deno.test("account id must be a positive integer", () => {
  assertEquals(validateAccountId(7), 7, "positive");
  for (const bad of [0, -1, 1.5, "1 OR 1=1", null]) {
    const res = validateAccountId(bad);
    assert(res instanceof Response, `${String(bad)} should be rejected`);
  }
});

Deno.test("search never reaches the SQL text", () => {
  const hostile = "'; DROP TABLE account; --";
  const { sql, countSql, params, countParams } = buildAccountsQuery(
    hostile,
    25,
    0,
  );

  assert(!sql.includes("DROP"), "listing SQL must not carry the search term");
  assert(
    !countSql.includes("DROP"),
    "count SQL must not carry the search term",
  );
  assert(!sql.includes(hostile), "listing SQL must not carry the raw term");
  assert(sql.includes("a.username LIKE ?"), "search must bind a placeholder");

  assertEquals(params.length, 4, "listing params");
  assertEquals(params[0], `%${hostile}%`, "username binding");
  assertEquals(params[1], `%${hostile}%`, "email binding");
  assertEquals(params[2], 25, "limit binding");
  assertEquals(params[3], 0, "offset binding");
  assertEquals(countParams.length, 2, "count params");
});

Deno.test("no search means no WHERE clause and no search bindings", () => {
  const { sql, params, countParams } = buildAccountsQuery("", 10, 20);
  assert(!sql.includes("LIKE"), "empty search must not add a LIKE");
  assertEquals(params.length, 2, "only limit and offset are bound");
  assertEquals(params[0], 10, "limit");
  assertEquals(params[1], 20, "offset");
  assertEquals(countParams.length, 0, "count takes no params");
});

Deno.test("search is trimmed and length-capped", () => {
  assertEquals(normalizeSearch("  bob  "), "bob", "trim");
  assertEquals(normalizeSearch(12345), "", "non-string");
  assertEquals(normalizeSearch("x".repeat(500)).length, 64, "cap");
});

Deno.test("limit and offset are bound, not spliced", () => {
  const { sql } = buildAccountsQuery("", 100, 999);
  assert(sql.includes("LIMIT ? OFFSET ?"), "pagination must use placeholders");
  assert(!sql.includes("999"), "offset must not appear in the SQL text");
});
