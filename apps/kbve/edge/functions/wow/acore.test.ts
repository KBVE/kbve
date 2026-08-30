// ---------------------------------------------------------------------------
// `deno test --allow-env functions/wow/acore.test.ts`
//
// acore.ts builds its statements as text, so the character class each value is
// held to is the only thing standing between a session token and the account
// table. The email is the one value that arrives unchecked, which makes these
// cases the boundary worth pinning.
// ---------------------------------------------------------------------------

Deno.env.delete("TC9_MYSQL_USER");
Deno.env.delete("TC9_MYSQL_PASSWORD");

import { sanitizeEmail } from "./acore.ts";

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

Deno.test("keeps the address the KBVE account signs in with", () => {
  assertEquals(sanitizeEmail("Player@KBVE.com"), "player@kbve.com", "lowercased");
  assertEquals(sanitizeEmail("  a.b+tag@sub.kbve.com  "), "a.b+tag@sub.kbve.com", "trimmed");
});

Deno.test("rejects anything that could break out of the statement", () => {
  for (const hostile of [
    "a'@kbve.com",
    'a"@kbve.com',
    "a\\@kbve.com",
    "a@kbve.com', 'x",
    "a@kbve.com; DROP TABLE account",
    "a\n@kbve.com",
    "a b@kbve.com",
  ]) {
    assertEquals(sanitizeEmail(hostile), "", `rejected: ${hostile}`);
  }
});

Deno.test("falls back to empty rather than failing a provision", () => {
  assertEquals(sanitizeEmail(undefined), "", "missing claim");
  assertEquals(sanitizeEmail(42), "", "non-string claim");
  assertEquals(sanitizeEmail("not-an-address"), "", "no domain");
  assertEquals(sanitizeEmail("a@kbve"), "", "no dot in domain");
  assertEquals(sanitizeEmail(`${"a".repeat(250)}@kbve.com`), "", "over the column width");
});
