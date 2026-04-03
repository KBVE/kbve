import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
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

    // Gate: service_role or staff only
    const accessErr = await requireStaffOrAdmin(claims, token);
    if (accessErr) return accessErr;

    const sizeErr = enforceBodySizeLimit(req);
    if (sizeErr) return sizeErr;

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
    console.error("irc error:", err);
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
