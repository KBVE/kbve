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

const PING_COOLDOWN_MS = 30_000;
const PING_RATE_WINDOW_MS = 60 * 60 * 1000;
const PING_RATE_MAX = 10;
const ROTATE_COOLDOWN_MS = 60_000;
const ROTATE_RATE_WINDOW_MS = 60 * 60 * 1000;
const ROTATE_RATE_MAX = 5;
const pingCooldown = new Map<string, number>();
const pingHistory = new Map<string, number[]>();
const rotateCooldown = new Map<string, number>();
const rotateHistory = new Map<string, number[]>();

function checkRotateRateLimit(
  userSub: string,
  serverId: string,
): { ok: true } | { ok: false; retryAfterMs: number; reason: string } {
  const key = `${userSub}:${serverId}`;
  const now = Date.now();
  const last = rotateCooldown.get(key) ?? 0;
  if (now - last < ROTATE_COOLDOWN_MS) {
    return {
      ok: false,
      retryAfterMs: ROTATE_COOLDOWN_MS - (now - last),
      reason: "cooldown",
    };
  }
  const hist = (rotateHistory.get(key) ?? []).filter(
    (t) => now - t < ROTATE_RATE_WINDOW_MS,
  );
  if (hist.length >= ROTATE_RATE_MAX) {
    return {
      ok: false,
      retryAfterMs: ROTATE_RATE_WINDOW_MS - (now - hist[0]),
      reason: "hourly_limit",
    };
  }
  hist.push(now);
  rotateHistory.set(key, hist);
  rotateCooldown.set(key, now);
  return { ok: true };
}

function genHmacHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function upsertGuildSecret(
  ownerId: string,
  serverId: string,
  service: string,
  tokenName: string,
  tokenValue: string,
  description: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceClient();
  const { data, error } = await sb.schema("discordsh").rpc(
    "service_set_guild_token",
    {
      p_owner_id: ownerId,
      p_server_id: serverId,
      p_service: service,
      p_token_name: tokenName,
      p_token_value: tokenValue,
      p_description: description,
    },
  );
  if (error) {
    console.error("gh-admin: service_set_guild_token failed", error.message);
    return { ok: false, error: error.message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { success?: boolean; message?: string }
    | null;
  if (!row || !row.success) {
    return { ok: false, error: row?.message ?? "service_set_guild_token failed" };
  }
  return { ok: true };
}

function checkPingRateLimit(
  userSub: string,
  serverId: string,
  owner: string,
  repo: string,
): { ok: true } | { ok: false; retryAfterMs: number; reason: string } {
  const cdKey = `${userSub}:${serverId}`;
  const now = Date.now();
  const last = pingCooldown.get(cdKey) ?? 0;
  if (now - last < PING_COOLDOWN_MS) {
    return {
      ok: false,
      retryAfterMs: PING_COOLDOWN_MS - (now - last),
      reason: "cooldown",
    };
  }
  const histKey = `${userSub}:${serverId}:${owner}/${repo}`;
  const hist = (pingHistory.get(histKey) ?? []).filter(
    (t) => now - t < PING_RATE_WINDOW_MS,
  );
  if (hist.length >= PING_RATE_MAX) {
    return {
      ok: false,
      retryAfterMs: PING_RATE_WINDOW_MS - (now - hist[0]),
      reason: "hourly_limit",
    };
  }
  hist.push(now);
  pingHistory.set(histKey, hist);
  pingCooldown.set(cdKey, now);
  return { ok: true };
}

async function handlePing(
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
  const list = await githubCallback(
    "GET",
    `/repos/${owner}/${repo}/hooks`,
    pat,
  );
  if (list.status === 401 || list.status === 403) {
    return jsonResponse(
      { error: "GitHub PAT unauthorized for this repo" },
      403,
    );
  }
  if (list.status === 404) {
    return jsonResponse(
      { error: "Repo not found or PAT lacks access" },
      404,
    );
  }
  if (list.status < 200 || list.status >= 300 || !Array.isArray(list.body)) {
    return jsonResponse(
      { error: "GitHub API error listing hooks", status: list.status },
      502,
    );
  }
  const expectedUrl = `${SUPABASE_URL}/functions/v1/gh-webhook/${serverId}`;
  const kbveHook = (list.body as GithubHook[]).find(
    (h) => h.config?.url === expectedUrl,
  );
  if (!kbveHook) {
    return jsonResponse(
      {
        error:
          "No kbve webhook found on this repo — run webhooks.install first",
      },
      404,
    );
  }
  const ping = await githubCallback(
    "POST",
    `/repos/${owner}/${repo}/hooks/${kbveHook.id}/pings`,
    pat,
  );
  if (ping.status < 200 || ping.status >= 300) {
    return jsonResponse(
      {
        error: "GitHub ping failed",
        status: ping.status,
        detail: ping.body,
      },
      502,
    );
  }
  return jsonResponse({
    pinged: true,
    hook_id: kbveHook.id,
    url: expectedUrl,
  });
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

interface GithubDelivery {
  id: number;
  guid: string;
  delivered_at: string;
  redelivery: boolean;
  duration: number;
  status: string;
  status_code: number;
  event: string;
  action: string | null;
}

async function handleDeliveries(
  serverId: string,
  owner: string,
  repo: string,
  limit: number,
): Promise<Response> {
  const pat = await fetchGuildSecret(serverId, "github");
  if (!pat) {
    return jsonResponse(
      { error: "No GitHub PAT stored for this guild" },
      400,
    );
  }
  const list = await githubCallback(
    "GET",
    `/repos/${owner}/${repo}/hooks`,
    pat,
  );
  if (list.status === 401 || list.status === 403) {
    return jsonResponse(
      { error: "GitHub PAT unauthorized for this repo" },
      403,
    );
  }
  if (list.status === 404) {
    return jsonResponse(
      { error: "Repo not found or PAT lacks access" },
      404,
    );
  }
  if (list.status < 200 || list.status >= 300 || !Array.isArray(list.body)) {
    return jsonResponse(
      { error: "GitHub API error listing hooks", status: list.status },
      502,
    );
  }
  const expectedUrl = `${SUPABASE_URL}/functions/v1/gh-webhook/${serverId}`;
  const kbveHook = (list.body as GithubHook[]).find(
    (h) => h.config?.url === expectedUrl,
  );
  if (!kbveHook) {
    return jsonResponse(
      {
        error:
          "No kbve webhook found on this repo — run webhooks.install first",
      },
      404,
    );
  }
  const capped = Math.min(Math.max(limit, 1), 30);
  const deliveries = await githubCallback(
    "GET",
    `/repos/${owner}/${repo}/hooks/${kbveHook.id}/deliveries?per_page=${capped}`,
    pat,
  );
  if (
    deliveries.status < 200 || deliveries.status >= 300 ||
    !Array.isArray(deliveries.body)
  ) {
    return jsonResponse(
      {
        error: "GitHub API error listing deliveries",
        status: deliveries.status,
      },
      502,
    );
  }
  const rows = (deliveries.body as GithubDelivery[]).map((d) => ({
    id: d.id,
    guid: d.guid,
    delivered_at: d.delivered_at,
    redelivery: !!d.redelivery,
    duration: d.duration,
    status: d.status,
    status_code: d.status_code,
    event: d.event,
    action: d.action ?? null,
  }));
  return jsonResponse({ hook_id: kbveHook.id, deliveries: rows });
}

async function handleDelete(
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
    return jsonResponse(
      { error: "Repo not found or PAT lacks access" },
      404,
    );
  }
  if (list.status < 200 || list.status >= 300 || !Array.isArray(list.body)) {
    return jsonResponse(
      { error: "GitHub API error listing hooks", status: list.status },
      502,
    );
  }
  const expectedUrl = `${SUPABASE_URL}/functions/v1/gh-webhook/${serverId}`;
  const kbveHook = (list.body as GithubHook[]).find(
    (h) => h.config?.url === expectedUrl,
  );
  if (!kbveHook) {
    return jsonResponse({ deleted: false, already_absent: true });
  }
  const del = await githubCallback(
    "DELETE",
    `/repos/${owner}/${repo}/hooks/${kbveHook.id}`,
    pat,
  );
  if (del.status === 204) {
    return jsonResponse({ deleted: true, hook_id: kbveHook.id });
  }
  return jsonResponse(
    {
      error: "GitHub API error deleting hook",
      status: del.status,
      detail: del.body,
    },
    502,
  );
}

async function handleRotate(
  ownerId: string,
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
  const list = await githubCallback(
    "GET",
    `/repos/${owner}/${repo}/hooks`,
    pat,
  );
  if (list.status < 200 || list.status >= 300 || !Array.isArray(list.body)) {
    return jsonResponse(
      { error: "GitHub API error listing hooks", status: list.status },
      502,
    );
  }
  const expectedUrl = `${SUPABASE_URL}/functions/v1/gh-webhook/${serverId}`;
  const kbveHook = (list.body as GithubHook[]).find(
    (h) => h.config?.url === expectedUrl,
  );
  if (!kbveHook) {
    return jsonResponse(
      {
        error:
          "No kbve webhook found on this repo — install one before rotating",
      },
      404,
    );
  }
  const newHmac = genHmacHex(32);
  const patch = await githubCallback(
    "PATCH",
    `/repos/${owner}/${repo}/hooks/${kbveHook.id}/config`,
    pat,
    { secret: newHmac },
  );
  if (patch.status < 200 || patch.status >= 300) {
    return jsonResponse(
      {
        error: "GitHub PATCH hook config failed",
        status: patch.status,
        detail: patch.body,
      },
      502,
    );
  }
  const upsert = await upsertGuildSecret(
    ownerId,
    serverId,
    "github_webhook",
    "github-webhook-hmac",
    newHmac,
    `GitHub webhook HMAC for guild ${serverId} (rotated)`,
  );
  if (!upsert.ok) {
    return jsonResponse(
      {
        error:
          `Webhook secret rotated on GitHub but vault upsert failed: ${upsert.error}`,
      },
      500,
    );
  }
  return jsonResponse({ rotated: true, hook_id: kbveHook.id });
}

const REPO_HARD_CAP = 100;

async function handleEventStats(serverId: string): Promise<Response> {
  const repos = await fetchRepoAllowlist(serverId);
  if (repos.length === 0) {
    return jsonResponse({
      last_delivered_at: null,
      last_recorded_at: null,
      pending_count: 0,
      in_flight_count: 0,
      delivered_count: 0,
      failed_count: 0,
      oldest_pending_at: null,
    });
  }
  if (repos.length > REPO_HARD_CAP) {
    return jsonResponse(
      {
        error:
          `Allowlist has ${repos.length} repos; stats RPC accepts max ${REPO_HARD_CAP}`,
      },
      413,
    );
  }
  const sb = createServiceClient();
  const { data, error } = await sb.schema("gh").rpc(
    "service_get_guild_event_stats",
    { p_repos: repos },
  );
  if (error) {
    const errCode = (error as { code?: string }).code ?? "";
    if (errCode === "GH006") {
      return jsonResponse({ error: error.message }, 413);
    }
    console.error(
      "gh-admin: service_get_guild_event_stats failed",
      error.message,
    );
    return jsonResponse({ error: "stats lookup failed" }, 500);
  }
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  return jsonResponse(row);
}

async function handleEventFailed(
  serverId: string,
  limit: number,
): Promise<Response> {
  const repos = await fetchRepoAllowlist(serverId);
  if (repos.length === 0) {
    return jsonResponse({ events: [] });
  }
  if (repos.length > REPO_HARD_CAP) {
    return jsonResponse(
      {
        error:
          `Allowlist has ${repos.length} repos; failed-events RPC accepts max ${REPO_HARD_CAP}`,
      },
      413,
    );
  }
  const capped = Math.min(Math.max(limit, 1), 50);
  const sb = createServiceClient();
  const { data, error } = await sb.schema("gh").rpc(
    "service_get_recent_failed_events",
    { p_repos: repos, p_limit: capped },
  );
  if (error) {
    const errCode = (error as { code?: string }).code ?? "";
    if (errCode === "GH006") {
      return jsonResponse({ error: error.message }, 413);
    }
    console.error(
      "gh-admin: service_get_recent_failed_events failed",
      error.message,
    );
    return jsonResponse({ error: "failed-events lookup failed" }, 500);
  }
  return jsonResponse({ events: Array.isArray(data) ? data : [] });
}

async function handleEventPending(
  serverId: string,
  limit: number,
): Promise<Response> {
  const repos = await fetchRepoAllowlist(serverId);
  if (repos.length === 0) {
    return jsonResponse({ events: [] });
  }
  if (repos.length > REPO_HARD_CAP) {
    return jsonResponse(
      {
        error:
          `Allowlist has ${repos.length} repos; pending-events RPC accepts max ${REPO_HARD_CAP}`,
      },
      413,
    );
  }
  const capped = Math.min(Math.max(limit, 1), 50);
  const sb = createServiceClient();
  const { data, error } = await sb.schema("gh").rpc(
    "service_get_recent_pending_events",
    { p_repos: repos, p_limit: capped },
  );
  if (error) {
    const errCode = (error as { code?: string }).code ?? "";
    if (errCode === "GH006") {
      return jsonResponse({ error: error.message }, 413);
    }
    console.error(
      "gh-admin: service_get_recent_pending_events failed",
      error.message,
    );
    return jsonResponse({ error: "pending-events lookup failed" }, 500);
  }
  return jsonResponse({ events: Array.isArray(data) ? data : [] });
}

async function handleEventRequeue(
  serverId: string,
  eventId: number,
  reason: string | null,
): Promise<Response> {
  const repos = await fetchRepoAllowlist(serverId);
  if (repos.length === 0) {
    return jsonResponse(
      { error: "Empty allowlist — cannot requeue without repo scope" },
      400,
    );
  }
  const sb = createServiceClient();
  const { data, error } = await sb.schema("gh").rpc("service_requeue_event", {
    p_repos: repos,
    p_event_id: eventId,
    p_reason: reason,
  });
  if (error) {
    const errCode = (error as { code?: string }).code ?? "";
    const message = error.message ?? "requeue failed";
    if (errCode === "GH004") {
      return jsonResponse(
        {
          error:
            "Event not found, not in this guild's allowlist, or not in failed state",
        },
        404,
      );
    }
    if (errCode === "GH001" || errCode === "GH002" || errCode === "GH003") {
      return jsonResponse({ error: message }, 400);
    }
    if (errCode === "GH006") {
      return jsonResponse({ error: message }, 413);
    }
    console.error("gh-admin: service_requeue_event failed", message);
    return jsonResponse({ error: "requeue failed" }, 500);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id?: number; delivery_state?: number }
    | null;
  return jsonResponse({
    requeued: true,
    event_id: row?.id ?? eventId,
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
    event_id?: number;
    limit?: number;
    reason?: string;
  };
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

  const cmd = body.command ?? "";

  if (cmd.startsWith("events.")) {
    switch (cmd) {
      case "events.stats":
        return await handleEventStats(serverId);
      case "events.failed": {
        const limit = typeof body.limit === "number" ? body.limit : 10;
        return await handleEventFailed(serverId, limit);
      }
      case "events.pending": {
        const limit = typeof body.limit === "number" ? body.limit : 10;
        return await handleEventPending(serverId, limit);
      }
      case "events.requeue": {
        if (typeof body.event_id !== "number" || body.event_id <= 0) {
          return jsonResponse({ error: "event_id must be > 0" }, 400);
        }
        const reason =
          typeof body.reason === "string" && body.reason.trim().length > 0
            ? body.reason.trim().slice(0, 512)
            : null;
        return await handleEventRequeue(serverId, body.event_id, reason);
      }
      default:
        return jsonResponse(
          {
            error:
              'events.* command required (one of: "events.stats", "events.failed", "events.pending", "events.requeue")',
          },
          400,
        );
    }
  }

  const orErr = validateOwnerRepo(body.owner, body.repo);
  if (orErr) return orErr;

  const owner = body.owner as string;
  const repo = body.repo as string;

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
    case "webhooks.deliveries": {
      const limit = typeof body.limit === "number" ? body.limit : 10;
      return await handleDeliveries(serverId, owner, repo, limit);
    }
    case "webhooks.delete":
      return await handleDelete(serverId, owner, repo);
    case "webhooks.rotate": {
      const userSub = typeof claims.sub === "string" ? claims.sub : "";
      if (!userSub) {
        return jsonResponse(
          { error: "Authenticated user token missing sub claim" },
          401,
        );
      }
      const rate = checkRotateRateLimit(userSub, serverId);
      if (!rate.ok) {
        return jsonResponse(
          {
            error: rate.reason === "cooldown"
              ? `Wait ${Math.ceil(rate.retryAfterMs / 1000)}s between rotations`
              : `Hourly rotation limit exceeded — retry in ${Math.ceil(rate.retryAfterMs / 60_000)}m`,
            retry_after_ms: rate.retryAfterMs,
          },
          429,
        );
      }
      return await handleRotate(userSub, serverId, owner, repo);
    }
    case "webhooks.ping": {
      const userSub = typeof claims.sub === "string" ? claims.sub : "";
      if (!userSub) {
        return jsonResponse(
          { error: "Authenticated user token missing sub claim" },
          401,
        );
      }
      const rate = checkPingRateLimit(userSub, serverId, owner, repo);
      if (!rate.ok) {
        return jsonResponse(
          {
            error:
              rate.reason === "cooldown"
                ? `Wait ${Math.ceil(rate.retryAfterMs / 1000)}s between pings`
                : `Hourly ping limit of ${PING_RATE_MAX} per repo exceeded — retry in ${Math.ceil(rate.retryAfterMs / 60_000)}m`,
            retry_after_ms: rate.retryAfterMs,
          },
          429,
        );
      }
      return await handlePing(serverId, owner, repo);
    }
    default:
      return jsonResponse(
        {
          error:
            'command required (one of: "webhooks.install", "webhooks.list", "webhooks.ping", "webhooks.deliveries", "webhooks.rotate", "webhooks.delete", "events.stats", "events.failed", "events.requeue")',
        },
        400,
      );
  }
});
