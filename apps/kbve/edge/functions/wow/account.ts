import {
  createServiceClient,
  createUserClient,
  jsonResponse,
  normalizeUsername,
  requireUserToken,
  validateHex32,
  validateUsername,
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
//   create        — claim a username, then write acore_auth.account
//   set_password  — replace the SRP6 credential on a live account
//   release       — drop a claim that never finished provisioning
//
// The password never appears here. The browser derives the SRP6 salt and
// verifier locally and posts only those, which is exactly what the auth
// server stores, so a compromised edge worker still cannot learn a password.
//
// create is claim-then-write across two databases with no shared transaction.
// The ordering is chosen so the recoverable failure is the likely one: a
// Postgres claim with no MySQL row can be released and retried, whereas a
// MySQL row with no claim would be an orphaned game account nothing owns.
// ---------------------------------------------------------------------------

type Handler = (wowReq: WowRequest) => Promise<Response>;

interface AccountRow {
  username: string;
  status: number;
  is_provisioned: boolean;
  provisioned_at: string | null;
  created_at: string;
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

const handlers: Record<string, Handler> = {
  async status({ claims, token }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    const account = await readAccount(token);
    if (account instanceof Response) return account;

    return jsonResponse({ found: account !== null, account });
  },

  async create({ claims, body }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    if (!isConfigured()) {
      return jsonResponse(
        { error: "Game account provisioning is not configured" },
        503,
      );
    }

    const nameErr = validateUsername(body.username);
    if (nameErr) return nameErr;
    const saltErr = validateHex32(body.salt, "salt");
    if (saltErr) return saltErr;
    const verifierErr = validateHex32(body.verifier, "verifier");
    if (verifierErr) return verifierErr;

    const username = normalizeUsername(body.username)!;
    const salt = (body.salt as string).toUpperCase();
    const verifier = (body.verifier as string).toUpperCase();
    const userId = claims.sub;

    const service = createServiceClient();
    const { data, error } = await service.rpc("service_claim_wow_account", {
      p_user_id: userId,
      p_username: username,
    });
    if (error) return safeRpcError(error, "service_claim_wow_account");

    const claim = ((data ?? []) as {
      username: string;
      status: number;
      was_created: boolean;
    }[])[0];
    if (!claim) {
      return jsonResponse({ error: "Claim did not return a row" }, 500);
    }

    // Already live. Re-running create must not touch the existing credential —
    // that is what set_password is for.
    if (claim.status === 1) {
      return jsonResponse(
        { error: "You already have a game account", username: claim.username },
        409,
      );
    }
    if (claim.status === 2) {
      return jsonResponse({ error: "This game account is disabled" }, 403);
    }

    // A claim already exists under a different name. Provisioning it now would
    // hand the user an account they did not ask for, so surface the reserved
    // name and let them either keep it or release it first.
    if (!claim.was_created && claim.username !== username) {
      return jsonResponse(
        {
          error:
            `You already reserved the name ${claim.username}. Release it before choosing another.`,
          username: claim.username,
        },
        409,
      );
    }

    // status 0 covers both a fresh claim and a retry after a failed write. The
    // credential posted now wins in either case, since nothing has used the
    // earlier one to log in.
    try {
      await createAccount(claim.username, salt, verifier);
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        // MySQL holds the name but Postgres does not — the two got out of sync,
        // or someone made the account outside this flow. Free our claim so the
        // user can pick a different name.
        await service.rpc("service_release_wow_claim", { p_user_id: userId });
        return jsonResponse({ error: "Game username already taken" }, 409);
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

    return jsonResponse({ success: true, username: claim.username });
  },

  async set_password({ claims, token, body }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    if (!isConfigured()) {
      return jsonResponse(
        { error: "Game account provisioning is not configured" },
        503,
      );
    }

    const saltErr = validateHex32(body.salt, "salt");
    if (saltErr) return saltErr;
    const verifierErr = validateHex32(body.verifier, "verifier");
    if (verifierErr) return verifierErr;

    const account = await readAccount(token);
    if (account instanceof Response) return account;
    if (!account || !account.is_provisioned) {
      return jsonResponse({ error: "No provisioned game account" }, 404);
    }

    // The name comes from the ledger, never from the request, so a caller
    // cannot rewrite someone else's credential by naming their account.
    const username = normalizeUsername(account.username);
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
