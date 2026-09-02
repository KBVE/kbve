import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, withCors } from "../_shared/cors.ts";
import { buildHelpText, parseCommand } from "../_shared/routing.ts";
import { logError } from "../_shared/logging.ts";
import {
  enforceBodySizeLimit,
  requireJsonContentType,
} from "../_shared/validators.ts";
import { AuthError, extractToken, jsonResponse, parseJwt } from "./_shared.ts";
import { ACCOUNT_ACTIONS, handleAccount } from "./account.ts";
import { handleStaff, STAFF_ACTIONS } from "./staff.ts";

// ---------------------------------------------------------------------------
// WoW Edge Function — Unified Router
//
// Command format: "module.action"
//   account: status, reserve, provision, set_password, release
//   staff:   realm_status, online_characters, accounts, set_gm_level,
//            ban_account, unban_account
// ---------------------------------------------------------------------------

const MODULES: Record<
  string,
  {
    handler: (wowReq: import("./_shared.ts").WowRequest) => Promise<Response>;
    actions: string[];
  }
> = {
  account: { handler: handleAccount, actions: ACCOUNT_ACTIONS },
  staff: { handler: handleStaff, actions: STAFF_ACTIONS },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflight(req);
  }

  if (req.method !== "POST") {
    return withCors(
      jsonResponse({ error: "Only POST method is allowed" }, 405),
      req,
    );
  }

  const ctErr = requireJsonContentType(req);
  if (ctErr) return withCors(ctErr, req);

  try {
    const token = extractToken(req);
    const claims = await parseJwt(token);
    const sizeErr = enforceBodySizeLimit(req);
    if (sizeErr) return withCors(sizeErr, req);

    const body = await req.json();
    const { command } = body;

    const parsed = parseCommand(command, buildHelpText(MODULES));
    if (parsed instanceof Response) return withCors(parsed, req);

    const mod = MODULES[parsed.module];
    if (!mod) {
      return withCors(
        jsonResponse(
          {
            error: `Unknown module: ${parsed.module}. Available modules: ${
              Object.keys(MODULES).join(", ")
            }`,
          },
          400,
        ),
        req,
      );
    }

    const res = await mod.handler({
      token,
      claims,
      body,
      action: parsed.action,
    });
    return withCors(res, req);
  } catch (err) {
    logError("wow", err);
    if (err instanceof AuthError) {
      return withCors(jsonResponse({ error: err.message }, err.status), req);
    }
    if (err instanceof SyntaxError) {
      return withCors(jsonResponse({ error: "Invalid JSON body" }, 400), req);
    }
    return withCors(jsonResponse({ error: "Internal server error" }, 500), req);
  }
});
