import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, withCors } from "../_shared/cors.ts";
import { buildHelpText, parseCommand } from "../_shared/routing.ts";
import { logError } from "../_shared/logging.ts";
import { rateLimit, rateLimitKey } from "../_shared/ratelimit.ts";
import { loadEnv } from "../_shared/env.ts";
import {
  requireJsonContentType,
  enforceBodySizeLimit,
} from "../_shared/validators.ts";
import {
  extractToken,
  jsonResponse,
  parseJwt,
  requireStaffOrAdmin,
  type IrcRequest,
} from "./_shared.ts";
import { CHANNEL_ACTIONS, handleChannel } from "./channel.ts";
import { MESSAGE_ACTIONS, handleMessage } from "./message.ts";
import { SERVER_ACTIONS, handleServer } from "./server.ts";

loadEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
]);

// ---------------------------------------------------------------------------
// IRC Edge Function — Admin Router
//
// Provides a REST interface to the internal Ergo IRC server.
// All actions require service_role JWT or staff permissions.
//
// Command format: "module.action"
//   server:   status, motd
//   channel:  list, topic, names
//   message:  send, history
// ---------------------------------------------------------------------------

const MODULES: Record<
  string,
  {
    handler: (req: IrcRequest) => Promise<Response>;
    actions: string[];
  }
> = {
  server: { handler: handleServer, actions: SERVER_ACTIONS },
  channel: { handler: handleChannel, actions: CHANNEL_ACTIONS },
  message: { handler: handleMessage, actions: MESSAGE_ACTIONS },
};

const HELP = buildHelpText(MODULES);

serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return preflight(req);
  }

  if (req.method !== "POST") {
    return withCors(jsonResponse({ error: "Only POST method is allowed" }, 405), req);
  }

  const rl = rateLimit(rateLimitKey("irc", req), {
    limit: 120,
    windowMs: 60_000,
  });
  if (rl) return withCors(rl, req);

  const ctErr = requireJsonContentType(req);
  if (ctErr) return withCors(ctErr, req);

  try {
    const token = extractToken(req);
    const claims = await parseJwt(token);

    const accessErr = await requireStaffOrAdmin(claims, token);
    if (accessErr) return withCors(accessErr, req);

    const sizeErr = enforceBodySizeLimit(req);
    if (sizeErr) return withCors(sizeErr, req);

    const body = await req.json();

    const parsed = parseCommand(body.command, HELP);
    if (parsed instanceof Response) return withCors(parsed, req);

    const mod = MODULES[parsed.module];
    if (!mod) {
      return withCors(
        jsonResponse(
          {
            error: `Unknown module: ${parsed.module}. Available: ${Object.keys(MODULES).join(", ")}`,
          },
          400,
        ),
        req,
      );
    }

    return withCors(
      await mod.handler({ token, claims, body, action: parsed.action }),
      req,
    );
  } catch (err) {
    logError("irc", err);
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
