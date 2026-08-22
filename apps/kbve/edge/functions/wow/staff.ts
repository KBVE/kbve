import {
  jsonResponse,
  requireStaffOrServiceRole,
  type WowRequest,
} from "./_shared.ts";
import { isConfigured, withDatabase } from "./acore.ts";
import type { Param, Row } from "./mysql.ts";
import { logError, logInfo } from "../_shared/logging.ts";

// ---------------------------------------------------------------------------
// WoW Staff Module — read/admin backend for /dashboard/gameops/wow/
//
// Actions:
//   realm_status      — realmlist plus live population and account totals
//   online_characters — who is in world right now
//   accounts          — paged account list with gm level and ban state
//   set_gm_level      — write acore_auth.account_access
//   ban_account       — write acore_auth.account_banned
//   unban_account     — deactivate a live ban
//
// Authorization is the Postgres staff.members bitmask, resolved through the
// staff_permissions() RPC. A JWT role claim is never enough: staff membership
// can be revoked without the token that carries it expiring.
//
// The gate runs before isConfigured(), so a non-staff caller learns nothing
// about whether the game database is even reachable.
// ---------------------------------------------------------------------------

type Handler = (wowReq: WowRequest) => Promise<Response>;

const AUTH_DB = "acore_auth";
const CHARACTERS_DB = "acore_characters";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ONLINE_CHARACTER_CAP = 500;
const MAX_SEARCH_LENGTH = 64;
const MAX_REASON_LENGTH = 255;
const MAX_GM_LEVEL = 3;

// A ban row is live when it is flagged active and either never expires
// (unbandate == bandate is AzerothCore's permanent marker) or has not yet run
// out. The audit rows for lapsed bans stay in the table forever, so counting
// them would badly overstate how many accounts are actually banned.
const ACTIVE_BAN = `ab.active = 1
       AND (ab.unbandate = ab.bandate OR ab.unbandate > UNIX_TIMESTAMP())`;

export function unconfiguredResponse(): Response {
  return jsonResponse(
    {
      error: "Game database is not configured",
      code: "mysql_unconfigured",
    },
    503,
  );
}

function upstreamFailure(err: unknown): Response {
  logError("wow.staff", err);
  return jsonResponse(
    { error: "Could not reach the game database — try again shortly" },
    502,
  );
}

// Every numeric guard below tests the value as-is instead of coercing it.
// Number("3") is 3 and Number("") is 0, so a coercing guard would quietly wave
// through a string where the caller promised an integer.
function asInt(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null;
}

export function clampLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_LIMIT;
  const n = asInt(value);
  if (n === null || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export function parseOffset(value: unknown): number | Response {
  if (value === undefined || value === null) return 0;
  const n = asInt(value);
  if (n === null || n < 0) {
    return jsonResponse(
      { error: "offset must be a non-negative integer" },
      400,
    );
  }
  return n;
}

export function normalizeSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

export function validateAccountId(value: unknown): number | Response {
  const n = asInt(value);
  if (n === null || n < 1) {
    return jsonResponse(
      { error: "account_id must be a positive integer" },
      400,
    );
  }
  return n;
}

export function validateGmLevel(value: unknown): number | Response {
  const n = asInt(value);
  if (n === null || n < 0 || n > MAX_GM_LEVEL) {
    return jsonResponse(
      { error: `level must be an integer between 0 and ${MAX_GM_LEVEL}` },
      400,
    );
  }
  return n;
}

export interface AccountsQuery {
  sql: string;
  countSql: string;
  params: Param[];
  countParams: Param[];
}

/**
 * Builds the account listing. `search` is bound, never spliced: the WHERE
 * fragment is a source literal chosen by presence of a term, and the term
 * itself only ever reaches the server as a parameter.
 *
 * gm level and ban state are correlated subqueries rather than joins because
 * account_access holds one row per realm and account_banned one row per ban —
 * joining either would multiply the account out into duplicate rows.
 */
export function buildAccountsQuery(
  search: string,
  limit: number,
  offset: number,
): AccountsQuery {
  const where = search === ""
    ? ""
    : "WHERE a.username LIKE ? OR a.email LIKE ?";
  const like = `%${search}%`;
  const searchParams: Param[] = search === "" ? [] : [like, like];

  const sql = `SELECT a.id,
       a.username,
       a.email,
       a.joindate,
       a.last_ip,
       a.last_login,
       a.expansion,
       a.online,
       COALESCE(
         (SELECT MAX(aa.gmlevel)
            FROM ${AUTH_DB}.account_access aa
           WHERE aa.id = a.id), 0) AS gmlevel,
       EXISTS(SELECT 1
                FROM ${AUTH_DB}.account_banned ab
               WHERE ab.id = a.id AND ${ACTIVE_BAN}) AS banned,
       (SELECT ab.banreason
          FROM ${AUTH_DB}.account_banned ab
         WHERE ab.id = a.id AND ${ACTIVE_BAN}
         ORDER BY ab.bandate DESC
         LIMIT 1) AS ban_reason
  FROM ${AUTH_DB}.account a
  ${where}
 ORDER BY a.id
 LIMIT ? OFFSET ?`;

  const countSql =
    `SELECT COUNT(*) AS total FROM ${AUTH_DB}.account a ${where}`;

  return {
    sql,
    countSql,
    params: [...searchParams, limit, offset],
    countParams: searchParams,
  };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function auditMutation(
  claims: WowRequest["claims"],
  action: string,
  accountId: number,
  fields: Record<string, unknown> = {},
): void {
  logInfo("wow.staff.audit", {
    actor: claims.sub ??
      (claims.role === "service_role" ? "service_role" : null),
    action,
    target_account_id: accountId,
    ...fields,
  });
}

const handlers: Record<string, Handler> = {
  async realm_status() {
    try {
      const realms = await withDatabase(AUTH_DB, async (conn) => {
        const list = await conn.prepared(
          `SELECT id, name, address, port, icon, timezone, population
             FROM ${AUTH_DB}.realmlist
            ORDER BY id`,
        );
        const accounts = await conn.prepared(
          `SELECT COUNT(*) AS total FROM ${AUTH_DB}.account`,
        );
        const banned = await conn.prepared(
          `SELECT COUNT(DISTINCT ab.id) AS total
             FROM ${AUTH_DB}.account_banned ab
            WHERE ${ACTIVE_BAN}`,
        );
        return {
          rows: list.rows,
          accounts: num(accounts.rows[0]?.total),
          banned: num(banned.rows[0]?.total),
        };
      });

      const online = await withDatabase(CHARACTERS_DB, async (conn) => {
        const res = await conn.prepared(
          `SELECT COUNT(*) AS total
             FROM ${CHARACTERS_DB}.characters
            WHERE online = 1`,
        );
        return num(res.rows[0]?.total);
      });

      return jsonResponse({
        realms: realms.rows.map((r) => ({
          id: num(r.id),
          name: r.name,
          address: r.address,
          port: num(r.port),
          icon: num(r.icon),
          timezone: num(r.timezone),
          population: num(r.population),
        })),
        online,
        accounts: realms.accounts,
        banned_accounts: realms.banned,
      });
    } catch (err) {
      return upstreamFailure(err);
    }
  },

  async online_characters() {
    try {
      const characters = await withDatabase(CHARACTERS_DB, async (conn) => {
        const res = await conn.prepared(
          `SELECT guid,
                  name,
                  level,
                  \`class\` AS class_id,
                  race AS race_id,
                  gender,
                  zone AS zone_id,
                  map AS map_id,
                  account AS account_id
             FROM ${CHARACTERS_DB}.characters
            WHERE online = 1
            ORDER BY name
            LIMIT ?`,
          [ONLINE_CHARACTER_CAP],
        );
        return res.rows;
      });

      // acore_characters and acore_auth are distinct schemas and the schema is
      // pinned at handshake time, so the account name is resolved with a second
      // connection and merged here instead of through a cross-schema join.
      const accountIds = [
        ...new Set(characters.map((c) => num(c.account_id))),
      ].filter((id) => id > 0);

      const names = new Map<number, string>();
      if (accountIds.length > 0) {
        const placeholders = accountIds.map(() => "?").join(", ");
        const rows = await withDatabase(AUTH_DB, async (conn) => {
          const res = await conn.prepared(
            `SELECT id, username
               FROM ${AUTH_DB}.account
              WHERE id IN (${placeholders})`,
            accountIds,
          );
          return res.rows;
        });
        for (const row of rows) {
          names.set(num(row.id), String(row.username ?? ""));
        }
      }

      return jsonResponse({
        characters: characters.map((c: Row) => ({
          guid: num(c.guid),
          name: c.name,
          level: num(c.level),
          class_id: num(c.class_id),
          race_id: num(c.race_id),
          gender: num(c.gender),
          zone_id: num(c.zone_id),
          map_id: num(c.map_id),
          account_id: num(c.account_id),
          account_name: names.get(num(c.account_id)) ?? null,
        })),
      });
    } catch (err) {
      return upstreamFailure(err);
    }
  },

  async accounts({ body }) {
    const limit = clampLimit(body.limit);
    const offset = parseOffset(body.offset);
    if (offset instanceof Response) return offset;
    const search = normalizeSearch(body.search);

    const query = buildAccountsQuery(search, limit, offset);

    try {
      const result = await withDatabase(AUTH_DB, async (conn) => {
        const page = await conn.prepared(query.sql, query.params);
        const total = await conn.prepared(query.countSql, query.countParams);
        return { rows: page.rows, total: num(total.rows[0]?.total) };
      });

      return jsonResponse({
        accounts: result.rows.map((r) => ({
          id: num(r.id),
          username: r.username,
          email: r.email,
          joindate: r.joindate,
          last_ip: r.last_ip,
          last_login: r.last_login,
          expansion: num(r.expansion),
          online: num(r.online),
          gmlevel: num(r.gmlevel),
          banned: num(r.banned) === 1,
          ban_reason: r.ban_reason,
        })),
        total: result.total,
      });
    } catch (err) {
      return upstreamFailure(err);
    }
  },

  async set_gm_level({ claims, body }) {
    const accountId = validateAccountId(body.account_id);
    if (accountId instanceof Response) return accountId;
    const level = validateGmLevel(body.level);
    if (level instanceof Response) return level;

    // -1 is AzerothCore's "every realm" sentinel and the sane default for a
    // console that does not ask which realm a promotion applies to.
    const realmId = asInt(body.realm_id) ?? -1;

    try {
      await withDatabase(AUTH_DB, async (conn) => {
        if (level === 0) {
          await conn.prepared(
            `DELETE FROM ${AUTH_DB}.account_access
              WHERE id = ? AND RealmID = ?`,
            [accountId, realmId],
          );
          return;
        }
        await conn.prepared(
          `INSERT INTO ${AUTH_DB}.account_access (id, gmlevel, RealmID)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE gmlevel = ?`,
          [accountId, level, realmId, level],
        );
      });
    } catch (err) {
      return upstreamFailure(err);
    }

    auditMutation(claims, "set_gm_level", accountId, {
      level,
      realm_id: realmId,
    });
    return jsonResponse({ ok: true });
  },

  async ban_account({ claims, body }) {
    const accountId = validateAccountId(body.account_id);
    if (accountId instanceof Response) return accountId;

    const duration = asInt(body.duration_seconds ?? 0);
    if (duration === null || duration < 0) {
      return jsonResponse(
        { error: "duration_seconds must be a non-negative integer" },
        400,
      );
    }

    const reason = typeof body.reason === "string"
      ? body.reason.trim().slice(0, MAX_REASON_LENGTH)
      : "";
    if (reason === "") {
      return jsonResponse({ error: "reason is required" }, 400);
    }

    const actor = claims.sub ?? "service_role";

    try {
      await withDatabase(AUTH_DB, async (conn) => {
        // Retire any live ban first so the account never carries two of them —
        // the old row stays as history, it just stops counting.
        await conn.prepared(
          `UPDATE ${AUTH_DB}.account_banned
              SET active = 0
            WHERE id = ? AND active = 1`,
          [accountId],
        );
        // duration 0 leaves unbandate equal to bandate, which is how the auth
        // server reads "permanent".
        await conn.prepared(
          `INSERT INTO ${AUTH_DB}.account_banned
               (id, bandate, unbandate, bannedby, banreason, active)
           VALUES (?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP() + ?, ?, ?, 1) AS new
           ON DUPLICATE KEY UPDATE
               unbandate = new.unbandate,
               bannedby = new.bannedby,
               banreason = new.banreason,
               active = 1`,
          [accountId, duration, actor, reason],
        );
      });
    } catch (err) {
      return upstreamFailure(err);
    }

    auditMutation(claims, "ban_account", accountId, {
      duration_seconds: duration,
      permanent: duration === 0,
    });
    return jsonResponse({ ok: true });
  },

  async unban_account({ claims, body }) {
    const accountId = validateAccountId(body.account_id);
    if (accountId instanceof Response) return accountId;

    try {
      await withDatabase(AUTH_DB, async (conn) => {
        // active = 0 rather than DELETE: the row is the audit trail for why the
        // account was banned in the first place.
        await conn.prepared(
          `UPDATE ${AUTH_DB}.account_banned
              SET active = 0
            WHERE id = ? AND active = 1`,
          [accountId],
        );
      });
    } catch (err) {
      return upstreamFailure(err);
    }

    auditMutation(claims, "unban_account", accountId);
    return jsonResponse({ ok: true });
  },
};

export const STAFF_ACTIONS = Object.keys(handlers);

export async function handleStaff(wowReq: WowRequest): Promise<Response> {
  const handler = handlers[wowReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown staff action: ${wowReq.action}. Use: ${
          STAFF_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }

  const denied = await requireStaffOrServiceRole(wowReq.token, wowReq.claims);
  if (denied) return denied;

  if (!isConfigured()) return unconfiguredResponse();

  return handler(wowReq);
}
