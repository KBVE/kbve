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

const DISCORD_API_BASE = "https://discord.com/api/v10";
const BOT_TOKEN_VAULT_ID = "39781c47-be8f-4a10-ae3a-714da299ca07";
const FORUM_CHANNEL_TYPE = 15;

let cachedBotToken: { value: string; cached_at: number } | null = null;
const BOT_TOKEN_TTL_MS = 5 * 60 * 1000;

async function getBotToken(): Promise<string | null> {
  if (
    cachedBotToken && Date.now() - cachedBotToken.cached_at < BOT_TOKEN_TTL_MS
  ) {
    return cachedBotToken.value;
  }
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("get_vault_secret_by_id", {
    secret_id: BOT_TOKEN_VAULT_ID,
  });
  if (error) {
    console.error("discord-bot: vault lookup failed:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  const secret = (row as { decrypted_secret?: string } | null)
    ?.decrypted_secret;
  if (!secret || typeof secret !== "string") return null;
  cachedBotToken = { value: secret, cached_at: Date.now() };
  return secret;
}

function getBotClientId(): string | null {
  const id = Deno.env.get("DISCORD_BOT_CLIENT_ID");
  if (!id || !/^[0-9]{17,20}$/.test(id)) return null;
  return id;
}

function ownsGuild(claims: Record<string, unknown>, serverId: string): boolean {
  const og = claims.owned_guilds;
  if (!Array.isArray(og)) return false;
  return og.some((g) =>
    typeof g === "string" && /^[0-9]{17,20}$/.test(g) && g === serverId
  );
}

function validateSnowflake(v: unknown, field: string): Response | null {
  if (!v || typeof v !== "string" || !/^[0-9]{17,20}$/.test(v)) {
    return jsonResponse(
      { error: `${field} must be a Discord snowflake (17-20 digits)` },
      400,
    );
  }
  return null;
}

async function botCallback(
  method: "GET",
  path: string,
): Promise<{ status: number; body: unknown }> {
  const token = await getBotToken();
  if (!token) return { status: 500, body: { error: "Bot token unavailable" } };
  const res = await fetch(`${DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "User-Agent": "kbve-discord-bot-edge/0.1",
    },
  });
  let body: unknown;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body };
}

async function handleIsMember(serverId: string): Promise<Response> {
  const botId = getBotClientId();
  if (!botId) {
    return jsonResponse(
      { error: "DISCORD_BOT_CLIENT_ID env not configured on edge fn" },
      500,
    );
  }
  const { status, body } = await botCallback(
    "GET",
    `/guilds/${serverId}/members/${botId}`,
  );
  if (status === 404) {
    return jsonResponse({ is_member: false });
  }
  if (status === 401 || status === 403) {
    return jsonResponse({ error: "Bot token unauthorized" }, 502);
  }
  if (status === 429) {
    return jsonResponse({ error: "Discord rate limited" }, 429);
  }
  if (status >= 200 && status < 300) {
    return jsonResponse({
      is_member: true,
      joined_at: (body as { joined_at?: string } | null)?.joined_at ?? null,
    });
  }
  console.error(
    "discord-bot: unexpected /members status",
    { status, body },
  );
  return jsonResponse({ error: "Discord API error", status }, 502);
}

async function handleListForumChannels(serverId: string): Promise<Response> {
  const { status, body } = await botCallback(
    "GET",
    `/guilds/${serverId}/channels`,
  );
  if (status === 401 || status === 403) {
    return jsonResponse({ error: "Bot token unauthorized" }, 502);
  }
  if (status === 404) {
    return jsonResponse({ error: "Bot not in this guild" }, 404);
  }
  if (status === 429) {
    return jsonResponse({ error: "Discord rate limited" }, 429);
  }
  if (status < 200 || status >= 300 || !Array.isArray(body)) {
    console.error(
      "discord-bot: unexpected /channels status",
      { status, body },
    );
    return jsonResponse({ error: "Discord API error", status }, 502);
  }
  const channels = (body as Array<{
    id?: string;
    name?: string;
    type?: number;
    parent_id?: string | null;
    position?: number;
  }>)
    .filter((c) => c.type === FORUM_CHANNEL_TYPE && c.id && c.name)
    .map((c) => ({
      id: c.id!,
      name: c.name!,
      parent_id: c.parent_id ?? null,
      position: c.position ?? 0,
    }))
    .sort((a, b) => a.position - b.position);
  return jsonResponse({ channels });
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

  let claims: Record<string, unknown>;
  try {
    const token = extractToken(req);
    claims = await parseJwt(token) as Record<string, unknown>;
    const denied = requireUserToken(claims);
    if (denied) return denied;
  } catch (e) {
    console.error("discord-bot: auth failed:", e);
    return jsonResponse({ error: "Authentication failed" }, 401);
  }

  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return sizeErr;

  let body: { command?: string; server_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const sidErr = validateSnowflake(body.server_id, "server_id");
  if (sidErr) return sidErr;
  const serverId = body.server_id as string;

  if (!ownsGuild(claims, serverId)) {
    return jsonResponse(
      {
        error:
          "JWT owned_guilds claim does not include this server_id. Re-bootstrap or sign in with Discord.",
      },
      403,
    );
  }

  switch (body.command) {
    case "bot.is_member":
      return await handleIsMember(serverId);
    case "bot.list_forum_channels":
      return await handleListForumChannels(serverId);
    default:
      return jsonResponse(
        {
          error:
            'command required (one of: "bot.is_member", "bot.list_forum_channels")',
        },
        400,
      );
  }
});
