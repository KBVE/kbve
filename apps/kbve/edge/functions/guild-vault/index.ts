import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireJsonContentType } from "../_shared/validators.ts";
import {
  extractToken,
  type GuildVaultRequest,
  jsonResponse,
  parseJwt,
  requireUserToken,
} from "./_shared.ts";
import { handleTokens, TOKEN_ACTIONS } from "./tokens.ts";

// ---------------------------------------------------------------------------
// Guild Vault Edge Function — Router
//
// Auth: authenticated user only (no service_role dual-auth).
// Discord API ownership verification happens per-action in tokens.ts.
//
// Command format: "tokens.action"
//   tokens: set_token, list_tokens, delete_token, toggle_token
//
// Deliberately omits get_token — decrypted secrets are bot-only.
// ---------------------------------------------------------------------------

const MODULES: Record<
  string,
  {
    handler: (req: GuildVaultRequest) => Promise<Response>;
    actions: string[];
  }
> = {
  tokens: { handler: handleTokens, actions: TOKEN_ACTIONS },
};

function buildHelpText(): string {
  const commands: string[] = [];
  for (const [mod, { actions }] of Object.entries(MODULES)) {
    for (const action of actions) {
      commands.push(`${mod}.${action}`);
    }
  }
  return commands.join(", ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Only POST method is allowed" }, 405);
  }

  const ctErr = requireJsonContentType(req);
  if (ctErr) return ctErr;

  try {
    const token = extractToken(req);
    const claims = await parseJwt(token);

    // Guild vault: authenticated users only (no service_role)
    const denied = requireUserToken(claims);
    if (denied) return denied;

    const sub = claims.sub;
    if (!sub || typeof sub !== "string") {
      return jsonResponse({ error: "JWT is missing sub claim" }, 401);
    }

    const body = await req.json();
    const { command } = body;

    if (!command || typeof command !== "string") {
      return jsonResponse(
        {
          error:
            `command is required (format: "module.action"). Available: ${buildHelpText()}`,
        },
        400,
      );
    }

    const dotIndex = command.indexOf(".");
    if (dotIndex === -1) {
      return jsonResponse(
        {
          error:
            `Invalid command format. Use "module.action". Available: ${buildHelpText()}`,
        },
        400,
      );
    }

    const moduleName = command.slice(0, dotIndex);
    const action = command.slice(dotIndex + 1);

    const mod = MODULES[moduleName];
    if (!mod) {
      return jsonResponse(
        {
          error: `Unknown module: ${moduleName}. Available: ${
            Object.keys(MODULES).join(", ")
          }`,
        },
        400,
      );
    }

    return mod.handler({
      token,
      claims,
      body,
      action,
      userId: sub,
    });
  } catch (err) {
    console.error("guild-vault error:", err);
    const rawMessage = err instanceof Error
      ? err.message
      : "Internal server error";
    const isAuthError =
      rawMessage.includes("authorization") || rawMessage.includes("JWT");
    if (isAuthError) {
      return jsonResponse({ error: rawMessage }, 401);
    }
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
