import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, withCors } from "../_shared/cors.ts";
import { buildHelpText, parseCommand } from "../_shared/routing.ts";
import { logError } from "../_shared/logging.ts";
import { rateLimit, rateLimitKey } from "../_shared/ratelimit.ts";
import { loadEnv } from "../_shared/env.ts";
import {
  enforceBodySizeLimit,
  requireJsonContentType,
} from "../_shared/validators.ts";
import {
  extractToken,
  type ForumRequest,
  type JwtClaims,
  jsonResponse,
  parseJwt,
} from "./_shared.ts";
import { handleSpace, SPACE_ACTIONS } from "./spaces.ts";
import { handleTag, TAG_ACTIONS } from "./tags.ts";
import { handleThread, THREAD_ACTIONS } from "./threads.ts";

loadEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
]);

// ---------------------------------------------------------------------------
// Forum Edge Function — Read-only public router
//
// Anon-friendly: any valid JWT (anon, authenticated, service_role) can hit
// every action below. Internally we use service_role to call the locked
// service_* RPCs; RLS / RPC grants stay tight.
//
// Command format: "module.action"
//   space:  list, get
//   tag:    list, get
//   thread: list, get, tags
// ---------------------------------------------------------------------------

const MODULES: Record<
  string,
  { handler: (req: ForumRequest) => Promise<Response>; actions: string[] }
> = {
  space: { handler: handleSpace, actions: SPACE_ACTIONS },
  tag: { handler: handleTag, actions: TAG_ACTIONS },
  thread: { handler: handleThread, actions: THREAD_ACTIONS },
};

const HELP = buildHelpText(MODULES);

serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return preflight(req);
  }
  if (req.method !== "POST") {
    return withCors(jsonResponse({ error: "Only POST method is allowed" }, 405), req);
  }

  const rl = rateLimit(rateLimitKey("forum", req), {
    limit: 120,
    windowMs: 60_000,
  });
  if (rl) return withCors(rl, req);

  const ctErr = requireJsonContentType(req);
  if (ctErr) return withCors(ctErr, req);

  let claims: JwtClaims;
  try {
    const token = extractToken(req);
    claims = await parseJwt(token);
  } catch {
    return withCors(jsonResponse({ error: "Authentication required" }, 401), req);
  }

  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return withCors(sizeErr, req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return withCors(jsonResponse({ error: "Invalid JSON body" }, 400), req);
  }

  const parsed = parseCommand(body.command, HELP);
  if (parsed instanceof Response) return withCors(parsed, req);

  const mod = MODULES[parsed.module];
  if (!mod) {
    return withCors(
      jsonResponse(
        {
          error: `Unknown module: ${parsed.module}. Available: ${
            Object.keys(MODULES).join(", ")
          }`,
        },
        400,
      ),
      req,
    );
  }

  try {
    return withCors(
      await mod.handler({ claims, body, action: parsed.action }),
      req,
    );
  } catch (err) {
    logError("forum", err);
    return withCors(jsonResponse({ error: "Internal server error" }, 500), req);
  }
});
