import { isDuplicateKey, MysqlConnection, MysqlError } from "./mysql.ts";

// ---------------------------------------------------------------------------
// acore_auth writes.
//
// This is the half of provisioning that Postgres cannot do. The auth server
// reads acore_auth.account directly, so a game account only exists once a row
// lands here — wow.account in Postgres is just the ownership ledger.
//
// Every value interpolated below has already been checked against a fixed
// character class by the caller (^[A-Z0-9_-]{3,16}$ for names, ^[0-9A-F]{64}$
// for the credential halves), which is why these statements can be built as
// text without an escaping layer. The account email is the one value that does
// not arrive pre-checked, so sanitizeEmail applies a class of its own.
// ---------------------------------------------------------------------------

const HOST = Deno.env.get("TC9_MYSQL_HOST") ??
  "mysql.tocloud9.svc.cluster.local";
const PORT = Number(Deno.env.get("TC9_MYSQL_PORT") ?? "3306");
const USER = Deno.env.get("TC9_MYSQL_USER") ?? "";
const PASSWORD = Deno.env.get("TC9_MYSQL_PASSWORD") ?? "";

// WotLK 3.3.5a. The auth server refuses a client whose expansion exceeds this.
const EXPANSION_WOTLK = 2;

export function isConfigured(): boolean {
  return USER !== "" && PASSWORD !== "";
}

/**
 * Opens a connection with `database` already selected by the handshake.
 *
 * acore_auth and acore_characters are separate schemas, and the schema is
 * fixed at connect time here, so callers that need both take a connection per
 * schema rather than leaning on a cross-schema join.
 */
export async function withDatabase<T>(
  database: string,
  fn: (conn: MysqlConnection) => Promise<T>,
): Promise<T> {
  const conn = await MysqlConnection.connect({
    hostname: HOST,
    port: PORT,
    username: USER,
    password: PASSWORD,
    database,
  });
  try {
    return await fn(conn);
  } finally {
    conn.close();
  }
}

function withConnection<T>(
  fn: (conn: MysqlConnection) => Promise<T>,
): Promise<T> {
  return withDatabase("acore_auth", fn);
}

// AzerothCore keeps the account email for recovery and for the GM tooling that
// looks a player up by it, so it has to be the same address the KBVE account
// signs in with -- it comes from the session token, never from the request body.
//
// The pattern is the gate, not a cleanup: it admits no quote, backslash or
// control character, so the result is safe to interpolate like every other
// value here. Anything it rejects is stored as the empty string acore already
// defaults to, because a mail address is not worth failing a provision over.
// The 255 cap is the column width.
const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;

export function sanitizeEmail(email: unknown): string {
  if (typeof email !== "string") return "";
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 255 || !EMAIL_PATTERN.test(trimmed)) return "";
  return trimmed;
}

export class UsernameTakenError extends Error {
  constructor() {
    super("game username already taken");
    this.name = "UsernameTakenError";
  }
}

/**
 * Creates the game account. Idempotent in the sense that matters: a second
 * call for a username that already exists surfaces UsernameTakenError rather
 * than a generic failure, so the caller can tell "someone else has it" apart
 * from "the database is down" and decide whether to release the claim.
 */
export async function createAccount(
  username: string,
  salt: string,
  verifier: string,
  email: string,
): Promise<void> {
  const mail = sanitizeEmail(email);
  try {
    await withConnection((conn) =>
      conn.execute(
        `INSERT INTO acore_auth.account
             (username, salt, verifier, email, reg_mail, joindate, expansion)
         VALUES ('${username}', 0x${salt}, 0x${verifier}, '${mail}', '${mail}', NOW(), ${EXPANSION_WOTLK})`,
      )
    );
  } catch (err) {
    if (isDuplicateKey(err)) throw new UsernameTakenError();
    throw err;
  }
}

/**
 * Replaces the SRP6 credential. session_key is cleared alongside it because a
 * live session key would otherwise keep an already-authenticated client
 * connected under the old password.
 */
export async function setCredential(
  username: string,
  salt: string,
  verifier: string,
): Promise<boolean> {
  const affected = await withConnection((conn) =>
    conn.execute(
      `UPDATE acore_auth.account
          SET salt = 0x${salt}, verifier = 0x${verifier}, session_key = NULL
        WHERE username = '${username}'`,
    )
  );
  return affected > 0;
}

export { MysqlError };
