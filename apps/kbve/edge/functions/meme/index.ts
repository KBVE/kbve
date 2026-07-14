import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, withCors } from "../_shared/cors.ts";
import { requireJsonContentType, enforceBodySizeLimit } from "../_shared/validators.ts";
import { buildHelpText, parseCommand } from "../_shared/routing.ts";
import { logError } from "../_shared/logging.ts";
import {
  extractToken,
  jsonResponse,
  type JwtClaims,
  type MemeRequest,
  parseJwt,
} from "./_shared.ts";
import { FEED_ACTIONS, handleFeed } from "./feed.ts";
import { handleReaction, REACTION_ACTIONS } from "./reaction.ts";
import { handleSave, SAVE_ACTIONS } from "./save.ts";
import { handleUser, USER_ACTIONS } from "./user.ts";
import { COMMENT_ACTIONS, handleComment } from "./comment.ts";
import { handleProfile, PROFILE_ACTIONS } from "./profile.ts";
import { FOLLOW_ACTIONS, handleFollow } from "./follow.ts";
import { handleReport, REPORT_ACTIONS } from "./report.ts";
import { ADMIN_ACTIONS, handleAdmin } from "./admin.ts";

// ---------------------------------------------------------------------------
// Meme Edge Function — Unified Router
//
// Command format: "module.action"
//   feed:     list, view, share
//   reaction: add, remove
//   save:     add, remove
//   user:     reactions, saves
//   comment:  list, replies, create, delete
//   profile:  get, update, memes
//   follow:   add, remove
//   report:   create
//   admin:    create              (service_role only)
// ---------------------------------------------------------------------------

const MODULES: Record<
  string,
  {
    handler: (memeReq: MemeRequest) => Promise<Response>;
    actions: string[];
  }
> = {
  feed: { handler: handleFeed, actions: FEED_ACTIONS },
  reaction: { handler: handleReaction, actions: REACTION_ACTIONS },
  save: { handler: handleSave, actions: SAVE_ACTIONS },
  user: { handler: handleUser, actions: USER_ACTIONS },
  comment: { handler: handleComment, actions: COMMENT_ACTIONS },
  profile: { handler: handleProfile, actions: PROFILE_ACTIONS },
  follow: { handler: handleFollow, actions: FOLLOW_ACTIONS },
  report: { handler: handleReport, actions: REPORT_ACTIONS },
  admin: { handler: handleAdmin, actions: ADMIN_ACTIONS },
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
    // All access requires service_role — axum gateway handles user auth
    let token: string;
    let claims: JwtClaims;

    try {
      token = extractToken(req);
      claims = await parseJwt(token);
    } catch {
      return withCors(
        jsonResponse({ error: "Authentication required" }, 401),
        req,
      );
    }

    if (claims.role !== "service_role") {
      return withCors(
        jsonResponse(
          { error: "Forbidden: service_role required. Use the API gateway." },
          403,
        ),
        req,
      );
    }

    const sizeErr = enforceBodySizeLimit(req);
    if (sizeErr) return withCors(sizeErr, req);

    const body = await req.json();
    const { command } = body;

    const help = buildHelpText(MODULES);
    const parsed = parseCommand(command, help);
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

    return withCors(await mod.handler({ token, claims, body, action }), req);
  } catch (err) {
    logError("meme", err);
    const rawMessage = err instanceof Error
      ? err.message
      : "Internal server error";
    const isAuthError =
      rawMessage.includes("authorization") || rawMessage.includes("JWT");
    if (isAuthError) {
      return withCors(jsonResponse({ error: "Unauthorized" }, 401), req);
    }
    return withCors(
      jsonResponse({ error: "Internal server error" }, 500),
      req,
    );
  }
});
