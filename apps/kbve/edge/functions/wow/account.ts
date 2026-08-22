import {
  createServiceClient,
  createUserClient,
  jsonResponse,
  normalizeUsername,
  requireUserToken,
  validateHex32,
  type WowRequest,
} from "./_shared.ts";
import { safeRpcError } from "../_shared/validators.ts";
import {
  createAccount,
  isConfigured,
  setCredential,
  UsernameTakenError,
} from "./acore.ts";
import { logError } from "../_shared/logging.ts";

// ---------------------------------------------------------------------------
// WoW Account Module
//
// Actions:
//   status        — read the caller's game account row
//   reserve       — claim the derived game username, return what was taken
//   provision     — write acore_auth.account for a reserved name
//   set_password  — replace the SRP6 credential on a live account
//   release       — drop a claim that never finished provisioning
//
// The name is never supplied by the client. It is derived server-side from
// profile.username, and reserve returns the name that was actually taken —
// which may carry a collision suffix. That ordering is not cosmetic: SRP6
// hashes UPPER(name):UPPER(password), so a client that hashed against a
// guessed name would produce a verifier the auth server can never validate.
//
// The password never appears here either. The browser derives the salt and
// verifier locally and posts only those, which is exactly what the auth server
// stores, so a compromised edge worker still cannot learn a password.
//
// provision is claim-then-write across two databases with no shared
// transaction. The ordering is chosen so the recoverable failure is the likely
// one: a Postgres claim with no MySQL row can be released and retried, whereas
// a MySQL row with no claim would be an orphaned game account nothing owns.
// ---------------------------------------------------------------------------

type Handler = (wowReq: WowRequest) => Promise<Response>;

interface AccountRow {
  username: string | null;
  suggested_username: string;
  status: number | null;
  is_provisioned: boolean;
  provisioned_at: string | null;
  created_at: string | null;
}

interface ClaimRow {
  username: string;
  status: number;
  was_created: boolean;
}

async function readAccount(
  token: string,
): Promise<AccountRow | null | Response> {
  const supabase = createUserClient(token);
  const { data, error } = await supabase.rpc("proxy_get_wow_account");
  if (error) return safeRpcError(error, "proxy_get_wow_account");
  const rows = (data ?? []) as AccountRow[];
  return rows.length > 0 ? rows[0] : null;
}

function requireProvisioning(): Response | null {
  if (isConfigured()) return null;
  return jsonResponse(
    { error: "Game account provisioning is not configured" },
    503,
  );
}

const handlers: Record<string, Handler> = {
  async status({ claims, token }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    const row = await readAccount(token);
    if (row instanceof Response) return row;

    // No row at all means no KBVE username, which is a different problem from
    // having no game account — there is nothing to derive a name from yet.
    if (row === null) {
      return jsonResponse({
        found: false,
        needs_kbve_username: true,
        account: null,
        suggested_username: null,
      });
    }

    return jsonResponse({
      found: row.username !== null,
      needs_kbve_username: false,
      account: row.username === null ? null : row,
      suggested_username: row.suggested_username,
    });
  },

  async reserve({ claims }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    const unconfigured = requireProvisioning();
    if (unconfigured) return unconfigured;

    const service = createServiceClient();
    const { data, error } = await service.rpc("service_claim_wow_account", {
      p_user_id: claims.sub,
    });
    if (error) return safeRpcError(error, "service_claim_wow_account");

    const claim = ((data ?? []) as ClaimRow[])[0];
    if (!claim) {
      return jsonResponse({ error: "Claim did not return a row" }, 500);
    }
    if (claim.status === 2) {
      return jsonResponse({ error: "This game account is disabled" }, 403);
    }

    return jsonResponse({
      username: claim.username,
      // Already live. The caller must not overwrite the credential through
      // provision — set_password is the path for that.
      provisioned: claim.status === 1,
    });
  },

  async provision({ claims, token, body }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    const unconfigured = requireProvisioning();
    if (unconfigured) return unconfigured;

    const saltErr = validateHex32(body.salt, "salt");
    if (saltErr) return saltErr;
    const verifierErr = validateHex32(body.verifier, "verifier");
    if (verifierErr) return verifierErr;

    const row = await readAccount(token);
    if (row instanceof Response) return row;
    if (!row || row.username === null) {
      return jsonResponse(
        { error: "Reserve a game username before provisioning" },
        409,
      );
    }
    if (row.status === 1) {
      return jsonResponse(
        { error: "You already have a game account", username: row.username },
        409,
      );
    }
    if (row.status === 2) {
      return jsonResponse({ error: "This game account is disabled" }, 403);
    }

    // The name comes from the ledger, never from the request. A caller that
    // hashed against something else gets an account it cannot log into, but it
    // cannot touch anyone else's row.
    const username = normalizeUsername(row.username);
    if (!username) {
      return jsonResponse({ error: "Reserved game username is invalid" }, 500);
    }

    const userId = claims.sub;
    const service = createServiceClient();

    try {
      await createAccount(
        username,
        (body.salt as string).toUpperCase(),
        (body.verifier as string).toUpperCase(),
      );
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        // MySQL holds the name but Postgres does not — the two got out of sync,
        // or the account was made outside this flow. Free the claim so the next
        // reserve derives a suffixed name instead of retrying into the same wall.
        await service.rpc("service_release_wow_claim", { p_user_id: userId });
        return jsonResponse(
          { error: "That game name is already taken — try again" },
          409,
        );
      }
      logError("wow", err);
      await service.rpc("service_release_wow_claim", { p_user_id: userId });
      return jsonResponse(
        { error: "Could not reach the game database — try again shortly" },
        502,
      );
    }

    const { error: markErr } = await service.rpc(
      "service_mark_wow_provisioned",
      { p_user_id: userId },
    );
    if (markErr) {
      // The account is real and usable; only the ledger lags. Releasing the
      // claim here would orphan the MySQL row, so leave it and report success.
      logError("wow", markErr);
    }

    return jsonResponse({ success: true, username });
  },

  async set_password({ claims, token, body }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    const unconfigured = requireProvisioning();
    if (unconfigured) return unconfigured;

    const saltErr = validateHex32(body.salt, "salt");
    if (saltErr) return saltErr;
    const verifierErr = validateHex32(body.verifier, "verifier");
    if (verifierErr) return verifierErr;

    const row = await readAccount(token);
    if (row instanceof Response) return row;
    if (!row || !row.is_provisioned || row.username === null) {
      return jsonResponse({ error: "No provisioned game account" }, 404);
    }

    const username = normalizeUsername(row.username);
    if (!username) {
      return jsonResponse({ error: "Stored game username is invalid" }, 500);
    }

    try {
      const updated = await setCredential(
        username,
        (body.salt as string).toUpperCase(),
        (body.verifier as string).toUpperCase(),
      );
      if (!updated) {
        return jsonResponse(
          { error: "Game account row is missing — contact staff" },
          409,
        );
      }
    } catch (err) {
      logError("wow", err);
      return jsonResponse(
        { error: "Could not reach the game database — try again shortly" },
        502,
      );
    }

    return jsonResponse({ success: true });
  },

  async release({ claims }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    const service = createServiceClient();
    const { data, error } = await service.rpc("service_release_wow_claim", {
      p_user_id: claims.sub,
    });
    if (error) return safeRpcError(error, "service_release_wow_claim");

    return jsonResponse({ success: true, released: data === true });
  },
};

export const ACCOUNT_ACTIONS = Object.keys(handlers);

export async function handleAccount(wowReq: WowRequest): Promise<Response> {
  const handler = handlers[wowReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown account action: ${wowReq.action}. Use: ${
          ACCOUNT_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(wowReq);
}
