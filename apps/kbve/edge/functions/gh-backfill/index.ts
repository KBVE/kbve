import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createServiceClient,
  extractToken,
  jsonResponse,
  parseJwt,
} from "../_shared/supabase.ts";
import {
  enforceBodySizeLimit,
  requireJsonContentType,
} from "../_shared/validators.ts";

interface JwtClaimsLite {
  role?: string;
  owned_guilds?: unknown;
  sub?: string;
}

function ownsGuild(claims: JwtClaimsLite, serverId: string): boolean {
  const og = claims.owned_guilds;
  if (!Array.isArray(og)) return false;
  return og.some((g) =>
    typeof g === "string" && /^[0-9]{17,20}$/.test(g) && g === serverId
  );
}

const USER_SMOKE_COOLDOWN_MS = 15_000;
const USER_SMOKE_WINDOW_MS = 60 * 60 * 1000;
const USER_SMOKE_MAX_PER_HOUR = 20;
const USER_SMOKE_PER_PAGE_CAP = 30;
const USER_SMOKE_MAX_PAGES_CAP = 1;
const userSmokeCooldown = new Map<string, number>();
const userSmokeHistory = new Map<string, number[]>();

function checkUserSmokeRateLimit(
  userSub: string,
  guildId: string,
): { ok: true } | { ok: false; retryAfterMs: number; reason: string } {
  const cdKey = `${userSub}:${guildId}`;
  const now = Date.now();
  const last = userSmokeCooldown.get(cdKey) ?? 0;
  if (now - last < USER_SMOKE_COOLDOWN_MS) {
    return {
      ok: false,
      retryAfterMs: USER_SMOKE_COOLDOWN_MS - (now - last),
      reason: "cooldown",
    };
  }
  const hist = (userSmokeHistory.get(cdKey) ?? []).filter(
    (t) => now - t < USER_SMOKE_WINDOW_MS,
  );
  if (hist.length >= USER_SMOKE_MAX_PER_HOUR) {
    return {
      ok: false,
      retryAfterMs: USER_SMOKE_WINDOW_MS - (now - hist[0]),
      reason: "hourly_limit",
    };
  }
  hist.push(now);
  userSmokeHistory.set(cdKey, hist);
  userSmokeCooldown.set(cdKey, now);
  return { ok: true };
}

interface BackfillRequest {
  owner: string;
  repo: string;
  guild_id?: string;
  state?: "open" | "closed" | "all";
  per_page?: number;
  max_pages?: number;
}

const SNOWFLAKE_RE = /^[0-9]{17,20}$/;
const VAULT_GITHUB_SERVICE = "github";

interface GitHubIssueResp {
  number: number;
  title: string;
  state: string;
  body?: string | null;
  html_url: string;
  node_id?: string;
  labels?: Array<{ name?: string; color?: string }>;
  assignees?: Array<{ login?: string }>;
  user?: { login?: string };
  pull_request?: unknown;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}

const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 10;

function isValidSegment(s: unknown): s is string {
  return typeof s === "string" && REPO_RE.test(s);
}

async function loadRepoAllowlist(
  // deno-lint-ignore no-explicit-any
  sb: any,
  guildId: string,
): Promise<Set<string>> {
  try {
    const { data, error } = await sb.rpc("bot_get_guild_token", {
      p_server_id: guildId,
      p_service: "github_repos",
    });
    if (error || typeof data !== "string") return new Set();
    const parsed = JSON.parse(data) as { repos?: unknown };
    const list = Array.isArray(parsed.repos)
      ? parsed.repos.filter((x): x is string => typeof x === "string")
      : [];
    return new Set(list.map((r) => r.trim().toLowerCase()));
  } catch {
    return new Set();
  }
}

async function fetchPage(
  token: string,
  owner: string,
  repo: string,
  state: string,
  perPage: number,
  page: number,
): Promise<{ rows: GitHubIssueResp[]; rateLimitRemaining: number | null }> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "kbve-gh-backfill",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub API ${resp.status}: ${await resp.text()}`);
  }
  const rows = await resp.json() as GitHubIssueResp[];
  const remaining = resp.headers.get("x-ratelimit-remaining");
  return {
    rows,
    rateLimitRemaining: remaining ? parseInt(remaining, 10) : null,
  };
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
  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return sizeErr;

  let token = "";
  try {
    token = extractToken(req);
  } catch {
    return jsonResponse({ error: "authorization required" }, 401);
  }
  const claims = (await parseJwt(token).catch(() => ({}))) as JwtClaimsLite;
  const isServiceRole = claims.role === "service_role";
  const isUserToken =
    typeof claims.role === "string" &&
    claims.role !== "service_role" &&
    Array.isArray(claims.owned_guilds);
  if (!isServiceRole && !isUserToken) {
    return jsonResponse(
      {
        error:
          "Access denied: requires service_role or an authenticated Discord-linked user token",
      },
      403,
    );
  }

  let body: BackfillRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  if (!isValidSegment(body.owner) || !isValidSegment(body.repo)) {
    return jsonResponse({ error: "owner and repo are required and must match [A-Za-z0-9._-]" }, 400);
  }

  const state = body.state ?? "all";
  if (!["open", "closed", "all"].includes(state)) {
    return jsonResponse({ error: "state must be open|closed|all" }, 400);
  }

  let perPage = Math.min(Math.max(body.per_page ?? DEFAULT_PER_PAGE, 1), 100);
  let maxPages = Math.min(Math.max(body.max_pages ?? DEFAULT_MAX_PAGES, 1), 50);

  const guildId = (body.guild_id ?? Deno.env.get("GH_BACKFILL_DEFAULT_GUILD_ID") ?? "").trim();
  if (!SNOWFLAKE_RE.test(guildId)) {
    return jsonResponse(
      {
        error:
          "guild_id is required and must be a Discord snowflake (17–20 digits). Pass in body or set GH_BACKFILL_DEFAULT_GUILD_ID on the edge deployment.",
      },
      400,
    );
  }

  if (!isServiceRole && !ownsGuild(claims, guildId)) {
    return jsonResponse(
      {
        error:
          "JWT owned_guilds claim does not include this guild_id. Re-bootstrap or sign in with Discord.",
      },
      403,
    );
  }

  if (!isServiceRole) {
    const userSub = typeof claims.sub === "string" ? claims.sub : "";
    if (!userSub) {
      return jsonResponse(
        { error: "Authenticated user token missing sub claim" },
        401,
      );
    }
    const rate = checkUserSmokeRateLimit(userSub, guildId);
    if (!rate.ok) {
      return jsonResponse(
        {
          error:
            rate.reason === "cooldown"
              ? `Wait ${Math.ceil(rate.retryAfterMs / 1000)}s between smoke runs`
              : `Hourly smoke-test limit of ${USER_SMOKE_MAX_PER_HOUR} per guild exceeded — retry in ${Math.ceil(rate.retryAfterMs / 60_000)}m`,
          retry_after_ms: rate.retryAfterMs,
        },
        429,
      );
    }
    perPage = Math.min(perPage, USER_SMOKE_PER_PAGE_CAP);
    maxPages = Math.min(maxPages, USER_SMOKE_MAX_PAGES_CAP);
  }

  const sb = createServiceClient();

  const { data: githubToken, error: tokenErr } = await sb.rpc(
    "bot_get_guild_token",
    { p_server_id: guildId, p_service: VAULT_GITHUB_SERVICE },
  );
  if (tokenErr) {
    console.error("gh-backfill: vault lookup failed:", tokenErr.message);
    return jsonResponse({ error: "Failed to resolve GitHub token from vault" }, 500);
  }
  if (!githubToken || typeof githubToken !== "string") {
    return jsonResponse(
      {
        error: `No GitHub PAT found in vault for guild ${guildId} (service=${VAULT_GITHUB_SERVICE}).`,
      },
      404,
    );
  }

  const allowlist = await loadRepoAllowlist(sb, guildId);
  if (allowlist.size > 0) {
    const requested = `${body.owner}/${body.repo}`.toLowerCase();
    if (!allowlist.has(requested)) {
      return jsonResponse(
        {
          error:
            `Repo '${requested}' is not in this guild's allowlist. Add it under /dashboard/agents/github/.`,
          allowlist: Array.from(allowlist),
        },
        403,
      );
    }
  }

  let upserted = 0;
  let page = 1;
  let lastRateLimitRemaining: number | null = null;

  while (page <= maxPages) {
    let result: Awaited<ReturnType<typeof fetchPage>>;
    try {
      result = await fetchPage(githubToken, body.owner, body.repo, state, perPage, page);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("gh-backfill fetch error:", msg);
      return jsonResponse({ error: "GitHub fetch failed", detail: msg }, 502);
    }

    lastRateLimitRemaining = result.rateLimitRemaining;

    if (result.rows.length === 0) break;

    for (const issue of result.rows) {
      const labels = (issue.labels ?? []).map((l) => ({ name: l.name, color: l.color }));
      const assignees = (issue.assignees ?? []).map((a) => ({ login: a.login }));
      const { error } = await sb.schema("gh").rpc("upsert_issue", {
        p_owner: body.owner,
        p_repo: body.repo,
        p_number: issue.number,
        p_title: issue.title,
        p_state: issue.state,
        p_body: issue.body ?? null,
        p_labels: labels,
        p_assignees: assignees,
        p_author: issue.user?.login ?? null,
        p_html_url: issue.html_url,
        p_is_pull_request: !!issue.pull_request,
        p_github_node_id: issue.node_id ?? null,
        p_github_created_at: issue.created_at,
        p_github_updated_at: issue.updated_at,
        p_closed_at: issue.closed_at ?? null,
      });
      if (error) {
        console.error(
          `gh.upsert_issue failed for ${body.owner}/${body.repo}#${issue.number}: ${error.message}`,
        );
        continue;
      }
      upserted++;
    }

    if (result.rows.length < perPage) break;
    page++;
  }

  return jsonResponse(
    {
      ok: true,
      owner: body.owner,
      repo: body.repo,
      state,
      pages_walked: page,
      upserted,
      rate_limit_remaining: lastRateLimitRemaining,
    },
    200,
  );
});
