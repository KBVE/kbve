// Re-export shared utilities from the centralized module
export {
  createServiceClient,
  extractToken,
  jsonResponse,
  type JwtClaims,
  parseJwt,
  requireUserToken,
} from "../_shared/supabase.ts";

import { jsonResponse } from "../_shared/supabase.ts";

// ---------------------------------------------------------------------------
// Guild-vault-specific request type
// ---------------------------------------------------------------------------

export interface GuildVaultRequest {
  token: string;
  claims: import("../_shared/supabase.ts").JwtClaims;
  body: Record<string, unknown>;
  action: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Validators (guard pattern: return Response on failure, null on success)
// ---------------------------------------------------------------------------

const SNOWFLAKE_RE = /^\d{17,20}$/;
const TOKEN_NAME_RE = /^[a-z0-9_-]{3,64}$/;
const SERVICE_RE = /^[a-z0-9_]{2,32}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateSnowflake(
  id: unknown,
  field = "server_id",
): Response | null {
  if (!id || typeof id !== "string") {
    return jsonResponse({ error: `${field} is required` }, 400);
  }
  if (!SNOWFLAKE_RE.test(id)) {
    return jsonResponse(
      { error: `${field} must be a Discord snowflake (17-20 digits)` },
      400,
    );
  }
  return null;
}

export function validateTokenName(name: unknown): Response | null {
  if (!name || typeof name !== "string") {
    return jsonResponse(
      { error: "token_name is required (3-64 chars, lowercase a-z0-9_-)" },
      400,
    );
  }
  if (!TOKEN_NAME_RE.test(name)) {
    return jsonResponse(
      { error: "token_name must be 3-64 lowercase chars: a-z, 0-9, _, -" },
      400,
    );
  }
  return null;
}

export function validateService(service: unknown): Response | null {
  if (!service || typeof service !== "string") {
    return jsonResponse(
      { error: "service is required (2-32 chars, lowercase a-z0-9_)" },
      400,
    );
  }
  if (!SERVICE_RE.test(service)) {
    return jsonResponse(
      { error: "service must be 2-32 lowercase chars: a-z, 0-9, _" },
      400,
    );
  }
  return null;
}

export function validateTokenValue(value: unknown): Response | null {
  if (!value || typeof value !== "string") {
    return jsonResponse({ error: "token_value is required" }, 400);
  }
  if (value.length < 10 || value.length > 8000) {
    return jsonResponse(
      { error: "token_value must be 10-8000 characters" },
      400,
    );
  }
  return null;
}

export function validateDescription(desc: unknown): Response | null {
  if (desc === undefined || desc === null) return null;
  if (typeof desc !== "string") {
    return jsonResponse({ error: "description must be a string" }, 400);
  }
  if (desc.length > 500) {
    return jsonResponse(
      { error: "description must be at most 500 characters" },
      400,
    );
  }
  return null;
}

export function validateUuid(
  id: unknown,
  field = "token_id",
): Response | null {
  if (!id || typeof id !== "string") {
    return jsonResponse({ error: `${field} (UUID) is required` }, 400);
  }
  if (!UUID_RE.test(id)) {
    return jsonResponse({ error: `${field} must be a valid UUID` }, 400);
  }
  return null;
}

export function validateProviderToken(token: unknown): Response | null {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return jsonResponse(
      { error: "provider_token is required (Discord access token)" },
      400,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Discord API guild ownership verification (cached)
// ---------------------------------------------------------------------------

const DISCORD_API_BASE = "https://discord.com/api/v10";
const OWNERSHIP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface OwnershipCacheEntry {
  owned: boolean;
  timestamp: number;
}

interface DiscordGuild {
  id: string;
  owner: boolean;
}

const ownershipCache = new Map<string, OwnershipCacheEntry>();

function getCacheKey(userId: string, serverId: string): string {
  return `${userId}:${serverId}`;
}

function getCachedOwnership(
  userId: string,
  serverId: string,
): boolean | null {
  const key = getCacheKey(userId, serverId);
  const entry = ownershipCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > OWNERSHIP_CACHE_TTL_MS) {
    ownershipCache.delete(key);
    return null;
  }
  return entry.owned;
}

function setCachedOwnership(
  userId: string,
  serverId: string,
  owned: boolean,
): void {
  ownershipCache.set(getCacheKey(userId, serverId), {
    owned,
    timestamp: Date.now(),
  });

  // Lazy eviction: prune expired entries if cache grows large
  if (ownershipCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of ownershipCache) {
      if (now - v.timestamp > OWNERSHIP_CACHE_TTL_MS) {
        ownershipCache.delete(k);
      }
    }
  }
}

/**
 * Invalidate cached ownership for a user+server pair.
 * Called on RPC failures to detect ownership transfers.
 */
export function invalidateOwnershipCache(
  userId: string,
  serverId: string,
): void {
  ownershipCache.delete(getCacheKey(userId, serverId));
}

/**
 * Verify that the user owns the specified Discord guild via Discord API.
 * Results are cached for 5 minutes to reduce API calls.
 *
 * Returns null on success (user is owner), or a Response on failure.
 * Follows the guard pattern used by validateSnowflake, verifyCaptcha, etc.
 */
export async function verifyGuildOwnership(
  userId: string,
  serverId: string,
  providerToken: string,
): Promise<Response | null> {
  // Check cache first
  const cached = getCachedOwnership(userId, serverId);
  if (cached === true) return null;
  if (cached === false) {
    return jsonResponse(
      { error: "You are not the owner of this Discord server" },
      403,
    );
  }

  // Call Discord API
  try {
    const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });

    if (res.status === 401) {
      return jsonResponse(
        { error: "Discord token expired or invalid. Please re-authenticate." },
        401,
      );
    }

    if (res.status === 429) {
      console.warn(
        "Discord API rate limited. Retry after:",
        res.headers.get("retry-after"),
      );
      return jsonResponse(
        { error: "Discord API rate limited. Please try again later." },
        429,
      );
    }

    if (!res.ok) {
      console.error(`Discord API error: ${res.status} ${res.statusText}`);
      return jsonResponse(
        { error: "Failed to verify Discord guild ownership" },
        502,
      );
    }

    const guilds: DiscordGuild[] = await res.json();
    const guild = guilds.find((g) => g.id === serverId);
    const isOwner = guild?.owner === true;

    // Cache both positive and negative results
    setCachedOwnership(userId, serverId, isOwner);

    if (!isOwner) {
      return jsonResponse(
        { error: "You are not the owner of this Discord server" },
        403,
      );
    }

    return null;
  } catch (err) {
    console.error("Discord guild ownership verification error:", err);
    return jsonResponse(
      { error: "Failed to verify Discord guild ownership" },
      502,
    );
  }
}
