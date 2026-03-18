import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireJsonContentType } from "../_shared/validators.ts";
import { extractToken, jsonResponse, parseJwt } from "./_shared.ts";
import { handleVote, VOTE_ACTIONS } from "./vote.ts";
import { handleServer, SERVER_ACTIONS } from "./server.ts";
import { handleList, LIST_ACTIONS } from "./list.ts";

// ---------------------------------------------------------------------------
// Discordsh Edge Function — Unified Router
//
// Command format: "module.action"
//   vote:    cast
//   server:  submit
//   list:    servers  (public — no auth required)
// ---------------------------------------------------------------------------

const MODULES: Record<
  string,
  {
    handler: (
      req: import("./_shared.ts").DiscordshRequest,
    ) => Promise<Response>;
    actions: string[];
    public?: boolean;
  }
> = {
  vote: { handler: handleVote, actions: VOTE_ACTIONS },
  server: { handler: handleServer, actions: SERVER_ACTIONS },
  list: { handler: handleList, actions: LIST_ACTIONS, public: true },
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
            `Invalid command format. Use "module.action" (e.g. "vote.cast"). Available: ${buildHelpText()}`,
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
          error: `Unknown module: ${moduleName}. Available modules: ${
            Object.keys(MODULES).join(", ")
          }`,
        },
        400,
      );
    }

    // Public modules skip authentication
    let token = "";
    let claims = {} as import("./_shared.ts").JwtClaims;
    if (!mod.public) {
      token = extractToken(req);
      claims = await parseJwt(token);
    }

    return mod.handler({ token, claims, body, action });
  } catch (err) {
    console.error("discordsh error:", err);
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
