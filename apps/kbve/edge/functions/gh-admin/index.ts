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

const GITHUB_API_BASE = "https://api.github.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const WEBHOOK_EVENTS = ["issues", "issue_comment", "pull_request"];

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

function validateOwnerRepo(
  owner: unknown,
  repo: unknown,
): Response | null {
  if (
    !owner || typeof owner !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,38}$/.test(owner)
  ) {
    return jsonResponse(
      { error: "owner must be a valid GitHub login" },
      400,
    );
  }
  if (
    !repo || typeof repo !== "string" ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(repo)
  ) {
    return jsonResponse(
      { error: "repo must be a valid GitHub repo name" },
      400,
    );
  }
  return null;
}

async function fetchGuildSecret(
  serverId: string,
  service: string,
): Promise<string | null> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("bot_get_guild_token", {
    p_server_id: serverId,
    p_service: service,
  });
  if (error) {
    console.error(
      `gh-admin: vault lookup failed for ${service}:`,
      error.message,
    );
    return null;
  }
  if (!data || typeof data !== "string") return null;
  return data;
}

async function fetchRepoAllowlist(serverId: string): Promise<string[]> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("bot_get_guild_token", {
    p_server_id: serverId,
    p_service: "github_repos",
  });
  if (error || !data || typeof data !== "string") return [];
  try {
    const parsed = JSON.parse(data) as
      | string[]
      | { repos?: string[] };
    const list = Array.isArray(parsed) ? parsed : parsed.repos ?? [];
    return list.filter((r): r is string => typeof r === "string");
  } catch {
    return [];
  }
}

function isRepoAllowed(allowlist: string[], owner: string, repo: string) {
  const target = `${owner}/${repo}`.toLowerCase();
  return allowlist.some((r) => r.toLowerCase() === target);
}

async function githubCallback(
  method: "GET" | "POST" | "DELETE",
  path: string,
  pat: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "kbve-gh-admin-edge/0.1",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body: parsed };
}

interface GithubHook {
  id: number;
  type: string;
  name: string;
  active: boolean;
  events: string[];
  config: {
    url?: string;
    content_type?: string;
    insecure_ssl?: string;
  };
  updated_at: string;
  created_at: string;
}

async function handleList(
  serverId: string,
  owner: string,
  repo: string,
): Promise<Response> {
  const pat = await fetchGuildSecret(serverId, "github");
  if (!pat) {
    return jsonResponse(
      { error: "No GitHub PAT stored for this guild" },
      400,
    );
  }
  const { status, body } = await githubCallback(
    "GET",
    `/repos/${owner}/${repo}/hooks`,
    pat,
  );
  if (status === 401 || status === 403) {
    return jsonResponse(
      { error: "GitHub PAT unauthorized for this repo" },
      403,
    );
  }
  if (status === 404) {
    return jsonResponse({ error: "Repo not found or PAT lacks access" }, 404);
  }
  if (status < 200 || status >= 300 || !Array.isArray(body)) {
    return jsonResponse({ error: "GitHub API error", status }, 502);
  }
  const expectedUrl = `${SUPABASE_URL}/functions/v1/gh-webhook/${serverId}`;
  const hooks = (body as GithubHook[]).map((h) => ({
    id: h.id,
    name: h.name,
    active: h.active,
    events: h.events,
    url: h.config?.url ?? null,
    is_kbve: h.config?.url === expectedUrl,
    updated_at: h.updated_at,
  }));
  return jsonResponse({ expected_url: expectedUrl, hooks });
}

async function handleInstall(
  serverId: string,
  owner: string,
  repo: string,
): Promise<Response> {
  const pat = await fetchGuildSecret(serverId, "github");
  if (!pat) {
    return jsonResponse(
      { error: "No GitHub PAT stored for this guild" },
      400,
    );
  }
  const hmac = await fetchGuildSecret(serverId, "github_webhook");
  if (!hmac) {
    return jsonResponse(
      {
        error:
          "No HMAC webhook secret stored for this guild — finish the GitHub wizard first",
      },
      400,
    );
  }

  const url = `${SUPABASE_URL}/functions/v1/gh-webhook/${serverId}`;

  const list = await githubCallback(
    "GET",
    `/repos/${owner}/${repo}/hooks`,
    pat,
  );
  if (list.status === 401 || list.status === 403) {
    return jsonResponse(
      { error: "GitHub PAT unauthorized (needs admin:repo_hook scope)" },
      403,
    );
  }
  if (list.status === 404) {
    return jsonResponse({ error: "Repo not found or PAT lacks access" }, 404);
  }
  if (list.status < 200 || list.status >= 300 || !Array.isArray(list.body)) {
    return jsonResponse(
      { error: "GitHub API error listing hooks", status: list.status },
      502,
    );
  }

  const existing = (list.body as GithubHook[]).find(
    (h) => h.config?.url === url,
  );

  const payload = {
    name: "web",
    active: true,
    events: WEBHOOK_EVENTS,
    config: {
      url,
      content_type: "json",
      secret: hmac,
      insecure_ssl: "0",
    },
  };

  if (existing) {
    const patch = await githubCallback(
      "POST",
      `/repos/${owner}/${repo}/hooks/${existing.id}/pings`,
      pat,
    );
    if (patch.status >= 200 && patch.status < 300) {
      return jsonResponse({
        installed: false,
        already_present: true,
        hook_id: existing.id,
        pinged: true,
      });
    }
    return jsonResponse({
      installed: false,
      already_present: true,
      hook_id: existing.id,
      pinged: false,
    });
  }

  const created = await githubCallback(
    "POST",
    `/repos/${owner}/${repo}/hooks`,
    pat,
    payload,
  );
  if (created.status === 401 || created.status === 403) {
    return jsonResponse(
      {
        error:
          "GitHub PAT unauthorized to create webhooks (needs admin:repo_hook scope)",
      },
      403,
    );
  }
  if (created.status === 422) {
    return jsonResponse(
      {
        error: "GitHub rejected webhook config",
        detail: created.body,
      },
      422,
    );
  }
  if (created.status < 200 || created.status >= 300) {
    return jsonResponse(
      { error: "GitHub API error creating hook", status: created.status },
      502,
    );
  }
  const newHook = created.body as GithubHook;
  return jsonResponse({
    installed: true,
    already_present: false,
    hook_id: newHook.id,
    url,
  });
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
    console.error("gh-admin: auth failed:", e);
    return jsonResponse({ error: "Authentication failed" }, 401);
  }

  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return sizeErr;

  let body: {
    command?: string;
    server_id?: string;
    owner?: string;
    repo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const sidErr = validateSnowflake(body.server_id, "server_id");
  if (sidErr) return sidErr;
  const orErr = validateOwnerRepo(body.owner, body.repo);
  if (orErr) return orErr;

  const serverId = body.server_id as string;
  const owner = body.owner as string;
  const repo = body.repo as string;

  if (!ownsGuild(claims, serverId)) {
    return jsonResponse(
      {
        error:
          "JWT owned_guilds claim does not include this server_id. Re-bootstrap or sign in with Discord.",
      },
      403,
    );
  }

  const allowlist = await fetchGuildSecret(serverId, "github_repos")
    .then(async () => await fetchRepoAllowlist(serverId));
  if (!isRepoAllowed(allowlist, owner, repo)) {
    return jsonResponse(
      {
        error:
          "Repo not in this guild's github_repos allowlist — add it first",
      },
      403,
    );
  }

  switch (body.command) {
    case "webhooks.install":
      return await handleInstall(serverId, owner, repo);
    case "webhooks.list":
      return await handleList(serverId, owner, repo);
    default:
      return jsonResponse(
        {
          error:
            'command required (one of: "webhooks.install", "webhooks.list")',
        },
        400,
      );
  }
});
