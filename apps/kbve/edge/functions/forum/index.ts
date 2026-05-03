import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
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

function buildHelpText(): string {
  const out: string[] = [];
  for (const [mod, { actions }] of Object.entries(MODULES)) {
    for (const action of actions) out.push(`${mod}.${action}`);
  }
  return out.join(", ");
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

  // Verify the JWT but do NOT gate on role — anon, authenticated, and
  // service_role all may read. The service-role RPC calls happen
  // internally below.
  let claims: JwtClaims;
  try {
    const token = extractToken(req);
    claims = await parseJwt(token);
  } catch {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return sizeErr;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const command = body.command;
  if (typeof command !== "string" || !command.includes(".")) {
    return jsonResponse(
      {
        error:
          `command is required (format: "module.action"). Available: ${buildHelpText()}`,
      },
      400,
    );
  }

  const dotIndex = command.indexOf(".");
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

  try {
    return await mod.handler({ claims, body, action });
  } catch (err) {
    console.error("forum error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
