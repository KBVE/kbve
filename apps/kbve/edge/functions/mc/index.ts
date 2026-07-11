import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, withCors } from "../_shared/cors.ts";
import { buildHelpText, parseCommand } from "../_shared/routing.ts";
import { logError } from "../_shared/logging.ts";
import { requireJsonContentType, enforceBodySizeLimit } from "../_shared/validators.ts";
import { AuthError, extractToken, jsonResponse, parseJwt } from "./_shared.ts";
import { AUTH_ACTIONS, handleAuth } from "./auth.ts";
import { handlePlayer, PLAYER_ACTIONS } from "./player.ts";
import { CONTAINER_ACTIONS, handleContainer } from "./container.ts";
import { handleTransfer, TRANSFER_ACTIONS } from "./transfer.ts";
import { CHARACTER_ACTIONS, handleCharacter } from "./character.ts";
import { handleSkill, SKILL_ACTIONS } from "./skill.ts";
import { ADMIN_ACTIONS, handleAdmin } from "./admin.ts";
import { handleMojang, MOJANG_ACTIONS } from "./mojang.ts";

// ---------------------------------------------------------------------------
// MC Edge Function — Unified Router
//
// Command format: "module.action"
//   auth:      request_link, verify, status, lookup, unlink
//   player:    save, load
//   container: save, load
//   transfer:  record, history
//   character: save, load, add_xp
//   skill:     save, load, add_xp
//   admin:     execute, give, teleport, broadcast
//   mojang:    lookup
// ---------------------------------------------------------------------------

const MODULES: Record<
  string,
  {
    handler: (mcReq: import("./_shared.ts").McRequest) => Promise<Response>;
    actions: string[];
  }
> = {
  auth: { handler: handleAuth, actions: AUTH_ACTIONS },
  player: { handler: handlePlayer, actions: PLAYER_ACTIONS },
  container: { handler: handleContainer, actions: CONTAINER_ACTIONS },
  transfer: { handler: handleTransfer, actions: TRANSFER_ACTIONS },
  character: { handler: handleCharacter, actions: CHARACTER_ACTIONS },
  skill: { handler: handleSkill, actions: SKILL_ACTIONS },
  admin: { handler: handleAdmin, actions: ADMIN_ACTIONS },
  mojang: { handler: handleMojang, actions: MOJANG_ACTIONS },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflight(req);
  }

  if (req.method !== "POST") {
    return withCors(jsonResponse({ error: "Only POST method is allowed" }, 405), req);
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
    logError("mc", err);
    if (err instanceof AuthError) {
      return withCors(jsonResponse({ error: err.message }, err.status), req);
    }
    if (err instanceof SyntaxError) {
      return withCors(jsonResponse({ error: "Invalid JSON body" }, 400), req);
    }
    return withCors(jsonResponse({ error: "Internal server error" }, 500), req);
  }
});
