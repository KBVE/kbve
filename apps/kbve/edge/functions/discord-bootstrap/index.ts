import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  enforceBodySizeLimit,
  requireJsonContentType,
} from "../_shared/validators.ts";
import {
  createServiceClient,
  extractToken,
  jsonResponse,
  parseJwt,
  requireUserToken,
} from "../_shared/supabase.ts";

// ---------------------------------------------------------------------------
// discord-bootstrap edge fn (P5.8b)
//
// Called by the browser once after a successful Discord OAuth sign-in (or
// after JWT refresh). Reads the Discord provider_token from the request
// body, calls Discord's /users/@me + /users/@me/guilds, cross-checks the
// Discord ID against auth.identities (the OAuth-linked identity for this
// user), filters to owner-only guilds, and upserts the result into
// profile.discord_bootstrap_cache via the SECURITY DEFINER RPC. The
// custom_access_token_hook then picks up the freshly cached owned_guilds
// on the next JWT mint and embeds it as a JWT claim.
//
// Why the body carries provider_token instead of the edge fn fetching it
// from auth.identities directly: Supabase auth doesn't persist
// provider_tokens server-side by default. The client holds them
// (localStorage stash via AuthBridge) and forwards them here.
//
// Auth model
//   - User's Supabase JWT in Authorization header (verified by gateway).
//   - provider_token in body (NOT a Supabase token — Discord access token).
//   - Cross-check: Discord ID returned by the provider_token MUST match
//     auth.identities.provider_id for this user_id. Prevents a holder of
//     someone else's Discord token from injecting that user's guilds into
//     their own kbve bootstrap cache.
// ---------------------------------------------------------------------------

const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_GUILDS_FETCHED = 200; // Discord platform cap

interface DiscordUser {
  id: string;
}

interface DiscordGuild {
  id: string;
  owner: boolean;
}

function validateProviderToken(token: unknown): Response | null {
  if (!token || typeof token !== "string" || token.trim().length < 10) {
    return jsonResponse(
      { error: "provider_token is required (Discord access token)" },
      400,
    );
  }
  if (token.length > 4000) {
    return jsonResponse(
      { error: "provider_token exceeds reasonable length" },
      400,
    );
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Only POST is allowed" }, 405);
  }

  const ctErr = requireJsonContentType(req);
  if (ctErr) return ctErr;

  let userId: string;
  try {
    const token = extractToken(req);
    const claims = await parseJwt(token);
    const denied = requireUserToken(claims);
    if (denied) return denied;
    if (!claims.sub || typeof claims.sub !== "string") {
      return jsonResponse({ error: "JWT is missing sub claim" }, 401);
    }
    userId = claims.sub;
  } catch (e) {
    console.error("discord-bootstrap: auth failed:", e);
    return jsonResponse({ error: "Authentication failed" }, 401);
  }

  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return sizeErr;

  let providerToken: string;
  try {
    const body = await req.json();
    const ptErr = validateProviderToken(body.provider_token);
    if (ptErr) return ptErr;
    providerToken = (body.provider_token as string).trim();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // 1. Discord /users/@me → get the canonical Discord ID
  let discordUserId: string;
  try {
    const meRes = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (meRes.status === 401) {
      return jsonResponse(
        { error: "Discord provider_token rejected (401)" },
        401,
      );
    }
    if (meRes.status === 429) {
      return jsonResponse(
        { error: "Discord API rate limited" },
        429,
      );
    }
    if (!meRes.ok) {
      console.error("discord-bootstrap: /users/@me failed:", meRes.status);
      return jsonResponse(
        { error: "Failed to verify Discord identity" },
        502,
      );
    }
    const me = (await meRes.json()) as DiscordUser;
    if (!me.id || typeof me.id !== "string" || !/^[0-9]{17,20}$/.test(me.id)) {
      return jsonResponse(
        { error: "Discord returned malformed user id" },
        502,
      );
    }
    discordUserId = me.id;
  } catch (e) {
    console.error("discord-bootstrap: /users/@me threw:", e);
    return jsonResponse({ error: "Failed to call Discord" }, 502);
  }

  // 2. Cross-check: Discord ID must match this user's linked Discord
  //    identity in auth.identities. Closes the "attacker presents a
  //    stolen Discord token but signs in as themselves" gap.
  const supabase = createServiceClient();
  {
    const { data, error } = await supabase
      .schema("auth")
      .from("identities")
      .select("provider_id")
      .eq("user_id", userId)
      .eq("provider", "discord")
      .maybeSingle();
    if (error) {
      console.error(
        "discord-bootstrap: auth.identities lookup failed:",
        error.message,
      );
      return jsonResponse(
        { error: "Failed to verify linked Discord identity" },
        500,
      );
    }
    if (!data) {
      return jsonResponse(
        { error: "No Discord identity linked to this kbve account" },
        403,
      );
    }
    if (data.provider_id !== discordUserId) {
      console.warn(
        "discord-bootstrap: provider_id mismatch",
        { expected: data.provider_id, got: discordUserId, userId },
      );
      return jsonResponse(
        {
          error:
            "provider_token belongs to a different Discord identity than the one linked to this kbve account",
        },
        403,
      );
    }
  }

  // 3. Discord /users/@me/guilds → filter to owner-only
  let ownedGuildIds: string[];
  try {
    const gRes = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (gRes.status === 401) {
      return jsonResponse(
        { error: "Discord provider_token rejected (401)" },
        401,
      );
    }
    if (gRes.status === 429) {
      return jsonResponse(
        { error: "Discord API rate limited" },
        429,
      );
    }
    if (!gRes.ok) {
      console.error(
        "discord-bootstrap: /users/@me/guilds failed:",
        gRes.status,
      );
      return jsonResponse(
        { error: "Failed to fetch Discord guilds" },
        502,
      );
    }
    const raw = (await gRes.json()) as DiscordGuild[];
    if (!Array.isArray(raw)) {
      return jsonResponse(
        { error: "Discord returned malformed guilds payload" },
        502,
      );
    }
    ownedGuildIds = raw
      .slice(0, MAX_GUILDS_FETCHED)
      .filter((g) =>
        g && typeof g.id === "string" &&
        /^[0-9]{17,20}$/.test(g.id) && g.owner === true
      )
      .map((g) => g.id);
  } catch (e) {
    console.error("discord-bootstrap: /users/@me/guilds threw:", e);
    return jsonResponse({ error: "Failed to call Discord" }, 502);
  }

  // 4. Upsert via the RPC. The RPC dedups + first-seen-orders + caps
  //    at 50 internally, so we pass the raw owned list. Filtering above
  //    is defensive only.
  const { error: rpcError } = await supabase.schema("profile").rpc(
    "service_upsert_discord_bootstrap_cache",
    {
      p_user_id: userId,
      p_discord_provider_id: discordUserId,
      p_owned_guilds: ownedGuildIds,
    },
  );
  if (rpcError) {
    console.error(
      "discord-bootstrap: service_upsert RPC failed:",
      rpcError.message,
    );
    // SQLSTATE 22023 = validation failure from the RPC; map to 400.
    const status = rpcError.code === "22023" ? 400 : 500;
    return jsonResponse(
      { error: "Failed to upsert bootstrap cache", detail: rpcError.message },
      status,
    );
  }

  // Report back: counts only, not the raw guild list (browser will pick
  // it up via the JWT claim on the next mint anyway).
  return jsonResponse({
    success: true,
    discord_user_id: discordUserId,
    owned_guild_count: ownedGuildIds.length,
    capped_at: 50,
  });
});
