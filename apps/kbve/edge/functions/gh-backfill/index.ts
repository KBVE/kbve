import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createServiceClient,
  extractToken,
  jsonResponse,
  parseJwt,
  requireServiceRole,
} from "../_shared/supabase.ts";
import {
  enforceBodySizeLimit,
  requireJsonContentType,
} from "../_shared/validators.ts";

interface BackfillRequest {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  per_page?: number;
  max_pages?: number;
}

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
  const claims = await parseJwt(token).catch(() => ({}));
  const denied = requireServiceRole(claims);
  if (denied) return denied;

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

  const perPage = Math.min(Math.max(body.per_page ?? DEFAULT_PER_PAGE, 1), 100);
  const maxPages = Math.min(Math.max(body.max_pages ?? DEFAULT_MAX_PAGES, 1), 50);

  const githubToken = Deno.env.get("GITHUB_TOKEN") ?? Deno.env.get("GITHUB_TOKEN_PAT");
  if (!githubToken) {
    console.error("gh-backfill: GITHUB_TOKEN not configured");
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  const sb = createServiceClient();

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
