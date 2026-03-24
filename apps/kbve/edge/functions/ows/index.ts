import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireJsonContentType } from "../_shared/validators.ts";
import { extractToken, jsonResponse, parseJwt } from "./_shared.ts";
import { CHARACTER_ACTIONS, handleCharacter } from "./character.ts";
import { handleMaintenance, MAINTENANCE_ACTIONS } from "./maintenance.ts";

// ---------------------------------------------------------------------------
// OWS Edge Function — Admin Router
//
// All actions require service_role JWT (admin-only).
//
// Command format: "module.action"
//   character:    unstuck, reset_stats, lookup, list, create, delete, set_admin
//   maintenance:  cleanup_worldservers, cleanup_map_instances, status
// ---------------------------------------------------------------------------

const MODULES: Record<
  string,
  {
    handler: (req: import("./_shared.ts").OwsRequest) => Promise<Response>;
    actions: string[];
  }
> = {
  character: { handler: handleCharacter, actions: CHARACTER_ACTIONS },
  maintenance: { handler: handleMaintenance, actions: MAINTENANCE_ACTIONS },
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
    const body = await req.json();
    const { command } = body;

    if (!command || typeof command !== "string") {
      return jsonResponse(
        {
          error: `command is required (format: "module.action"). Available: ${buildHelpText()}`,
        },
        400,
      );
    }

    const dotIndex = command.indexOf(".");
    if (dotIndex === -1) {
      return jsonResponse(
        {
          error: `Invalid command format. Use "module.action". Available: ${buildHelpText()}`,
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
          error: `Unknown module: ${moduleName}. Available: ${Object.keys(MODULES).join(", ")}`,
        },
        400,
      );
    }

    return mod.handler({ token, claims, body, action });
  } catch (err) {
    console.error("ows error:", err);
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
