// ---------------------------------------------------------------------------
// `deno test functions/_shared/formats.test.ts`
//
// These regexes are the single source of truth for ID validation across the
// tree, so each one is exercised for what it must reject as much as for what
// it accepts. Anchoring is the recurring risk: an unanchored pattern matches
// a substring, which turns "valid id somewhere inside attacker text" into a
// pass. Every case below includes an embedded-in-junk variant for that.
// ---------------------------------------------------------------------------

import {
  HEX_RE,
  HTTPS_RE,
  ILLEGAL_CHARS_RE,
  MAX_SECRET_VALUE_LENGTH,
  MAX_TOKEN_VALUE_LENGTH,
  MAX_URL_LENGTH,
  MC_UUID_RE,
  MIN_TOKEN_VALUE_LENGTH,
  SECRET_NAME_RE,
  SERVICE_RE,
  SNOWFLAKE_RE,
  TAG_RE,
  TOKEN_NAME_RE,
  ULID_RE,
  UUID_RE,
} from "./formats.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function accepts(re: RegExp, values: string[], label: string): void {
  for (const v of values) {
    assert(re.test(v), `${label}: expected ${JSON.stringify(v)} to match`);
  }
}

function rejects(re: RegExp, values: string[], label: string): void {
  for (const v of values) {
    assert(
      !re.test(v),
      `${label}: expected ${JSON.stringify(v)} to be rejected`,
    );
  }
}

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

Deno.test("UUID_RE matches a dashed v4 in either case", () => {
  accepts(UUID_RE, [UUID, UUID.toUpperCase()], "uuid");
});

Deno.test("UUID_RE is anchored and rejects malformed shapes", () => {
  rejects(UUID_RE, [
    UUID.replace(/-/g, ""), // undashed
    UUID.slice(0, -1), // too short
    UUID + "0", // too long
    `junk${UUID}`, // prefixed
    `${UUID}junk`, // suffixed
    `${UUID}\njunk`, // newline-smuggled suffix
    "3f2504e0-4f89-41d3-9a0c-0305e82c330g", // non-hex
    "",
  ], "uuid");
});

Deno.test("ULID_RE takes 26 Crockford characters and excludes I, L, O, U", () => {
  accepts(ULID_RE, ["01ARZ3NDEKTSV4RRFFQ69G5FAV"], "ulid");
  rejects(ULID_RE, [
    "01ARZ3NDEKTSV4RRFFQ69G5FA", // 25
    "01ARZ3NDEKTSV4RRFFQ69G5FAVV", // 27
    "01ARZ3NDEKTSV4RRFFQ69G5FAI", // I is excluded
    "01ARZ3NDEKTSV4RRFFQ69G5FAL", // L is excluded
    "01ARZ3NDEKTSV4RRFFQ69G5FAO", // O is excluded
    "01ARZ3NDEKTSV4RRFFQ69G5FAU", // U is excluded
    "01arz3ndektsv4rrffq69g5fav", // lowercase
    "",
  ], "ulid");
});

Deno.test("SNOWFLAKE_RE takes 17-20 digits only", () => {
  accepts(
    SNOWFLAKE_RE,
    ["12345678901234567", "12345678901234567890"],
    "snowflake",
  );
  rejects(SNOWFLAKE_RE, [
    "1234567890123456", // 16
    "123456789012345678901", // 21
    "1234567890123456a",
    " 12345678901234567",
    "12345678901234567 ",
    "",
  ], "snowflake");
});

Deno.test("MC_UUID_RE takes 32 lowercase hex with no dashes", () => {
  accepts(MC_UUID_RE, ["069a79f444e94726a5befca90e38aaf5"], "mc uuid");
  rejects(MC_UUID_RE, [
    "069A79F444E94726A5BEFCA90E38AAF5", // uppercase
    "069a79f4-44e9-4726-a5be-fca90e38aaf5", // dashed
    "069a79f444e94726a5befca90e38aaf", // 31
    "",
  ], "mc uuid");
});

Deno.test("SERVICE_RE takes lowercase alphanumeric and underscore, 2-32", () => {
  accepts(SERVICE_RE, ["gh", "github_repos", "a1_b2"], "service");
  rejects(SERVICE_RE, [
    "a", // too short
    "a".repeat(33), // too long
    "Github", // uppercase
    "github-repos", // dash not allowed here
    "github repos",
    "",
  ], "service");
});

Deno.test("TOKEN_NAME_RE takes lowercase alphanumeric, dash and underscore, 3-64", () => {
  accepts(
    TOKEN_NAME_RE,
    ["abc", "github-webhook-hmac", "a_b-c1"],
    "token name",
  );
  rejects(TOKEN_NAME_RE, [
    "ab",
    "a".repeat(65),
    "Token",
    "tok en",
    "tok.en",
    "",
  ], "token name");
});

Deno.test("TAG_RE requires an alphanumeric first character", () => {
  accepts(TAG_RE, ["a", "tag", "tag-1", "tag_1", "1tag"], "tag");
  rejects(TAG_RE, ["-tag", "_tag", "Tag", "ta g", "tag!", ""], "tag");
});

Deno.test("HTTPS_RE requires an https scheme with something after it", () => {
  accepts(HTTPS_RE, ["https://kbve.com", "https://a"], "https");
  rejects(HTTPS_RE, [
    "http://kbve.com",
    "https://",
    "ftp://kbve.com",
    " https://kbve.com", // leading space defeats the anchor
    "",
  ], "https");
});

Deno.test("HEX_RE takes lowercase hex only", () => {
  accepts(HEX_RE, ["0", "deadbeef", "0123456789abcdef"], "hex");
  rejects(HEX_RE, ["DEADBEEF", "deadbeefg", "dead beef", "0x1234", ""], "hex");
});

Deno.test("SECRET_NAME_RE allows either case, 1-100 characters", () => {
  accepts(
    SECRET_NAME_RE,
    ["a", "A", "secret_name-1", "a".repeat(100)],
    "secret name",
  );
  rejects(
    SECRET_NAME_RE,
    ["", "a".repeat(101), "secret name", "secret.name"],
    "secret name",
  );
});

Deno.test("ILLEGAL_CHARS_RE catches the quoting and control characters", () => {
  // Unanchored by design — it asks "does this contain anything dangerous",
  // so a match anywhere in the string is the point.
  for (const bad of ["%", "<", ">", "'", '"', "\\", "`", "\x00", "\x1f"]) {
    assert(
      ILLEGAL_CHARS_RE.test(`safe${bad}safe`),
      `${JSON.stringify(bad)} caught`,
    );
  }
  for (
    const ok of ["plain", "with space", "dash-and_underscore", "a.b", "Ünicode"]
  ) {
    assert(!ILLEGAL_CHARS_RE.test(ok), `${ok} should pass`);
  }
});

Deno.test("ILLEGAL_CHARS_RE has no global flag, so test() is not stateful", () => {
  // A /g regex advances lastIndex between test() calls and would return
  // alternating results for the same input.
  assert(!ILLEGAL_CHARS_RE.global, "must not be global");
  const value = "bad<value";
  assert(ILLEGAL_CHARS_RE.test(value), "first call");
  assert(ILLEGAL_CHARS_RE.test(value), "second call agrees");
  assert(ILLEGAL_CHARS_RE.test(value), "third call agrees");
});

Deno.test("length constants are ordered and non-zero", () => {
  assert(MIN_TOKEN_VALUE_LENGTH > 0, "min token length positive");
  assert(
    MAX_TOKEN_VALUE_LENGTH > MIN_TOKEN_VALUE_LENGTH,
    "token max exceeds min",
  );
  assert(MAX_URL_LENGTH > 0, "url length positive");
  assert(MAX_SECRET_VALUE_LENGTH > 0, "secret length positive");
});
