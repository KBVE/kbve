import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, withCors } from "../_shared/cors.ts";
import { buildHelpText, parseCommand } from "../_shared/routing.ts";
import { logError } from "../_shared/logging.ts";
import { requireJsonContentType, enforceBodySizeLimit } from "../_shared/validators.ts";
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflight(req);
  }

  if (req.method !== "POST") {
    return withCors(jsonResponse({ error: "Only POST method is allowed" }, 405), req);
  }

  const ctErr = requireJsonContentType(req);
  if (ctErr) return withCors(ctErr, req);
  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return withCors(sizeErr, req);

  try {
    const body = await req.json();
    const { command } = body;

    const parsed = parseCommand(command, buildHelpText(MODULES));
    if (parsed instanceof Response) return withCors(parsed, req);

    const { module: moduleName, action } = parsed;

    const mod = MODULES[moduleName];
    if (!mod) {
      return withCors(
        jsonResponse(
          {
            error: `Unknown module: ${moduleName}. Available modules: ${
              Object.keys(MODULES).join(", ")
            }`,
          },
          400,
        ),
        req,
      );
    }

    let token = "";
    let claims = { role: "anon" } as import("./_shared.ts").JwtClaims;
    if (!mod.public) {
      token = extractToken(req);
      claims = await parseJwt(token);
    }

    const res = await mod.handler({ token, claims, body, action, req });
    return withCors(res, req);
  } catch (err) {
    logError("discordsh", err);
    const rawMessage = err instanceof Error
      ? err.message
      : "Internal server error";
    const isAuthError =
      rawMessage.includes("authorization") || rawMessage.includes("JWT");
    if (isAuthError) {
      return withCors(jsonResponse({ error: "Unauthorized" }, 401), req);
    }
    return withCors(jsonResponse({ error: "Internal server error" }, 500), req);
  }
});
