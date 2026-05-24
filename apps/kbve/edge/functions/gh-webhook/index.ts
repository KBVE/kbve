import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, jsonResponse } from "../_shared/supabase.ts";
import { enforceBodySizeLimit } from "../_shared/validators.ts";

const ALLOWED_EVENTS = new Set([
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "ping",
]);

const ALLOWED_REPOS = parseAllowlist(Deno.env.get("GH_WEBHOOK_ALLOWED_REPOS"));

interface GithubLabel {
  name?: string;
  color?: string;
}
interface GithubUserLite {
  login?: string;
}

interface GithubIssueLite {
  number: number;
  title: string;
  state: string;
  body?: string | null;
  html_url: string;
  node_id?: string;
  labels?: GithubLabel[];
  assignees?: GithubUserLite[];
  user?: GithubUserLite;
  pull_request?: unknown;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}

interface GithubPullLite extends GithubIssueLite {
  draft?: boolean;
  merged?: boolean;
}

interface GithubRepoLite {
  owner?: { login?: string };
  name?: string;
  full_name?: string;
}

interface GithubPayload {
  action?: string;
  issue?: GithubIssueLite;
  pull_request?: GithubPullLite;
  repository?: GithubRepoLite;
  comment?: { user?: GithubUserLite; body?: string };
  sender?: GithubUserLite;
}

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("/")),
  );
}

async function verifySignature(
  secret: string,
  signatureHeader: string | null,
  body: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expected = signatureHeader.slice("sha256=".length).toLowerCase();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const actual = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, actual);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function repoFromPayload(p: GithubPayload): { owner: string; repo: string } | null {
  const r = p.repository;
  if (!r) return null;
  const owner = r.owner?.login ?? "";
  const repo = r.name ?? (r.full_name?.split("/")[1] ?? "");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function issueFromPayload(p: GithubPayload): GithubIssueLite | null {
  if (p.issue) return p.issue;
  if (p.pull_request) return p.pull_request;
  return null;
}

function mapEventType(githubEvent: string, action: string | undefined): string {
  if (githubEvent === "issue_comment") {
    return action === "created" ? "commented" : `comment_${action ?? "unknown"}`;
  }
  if (githubEvent === "pull_request_review") {
    return action === "submitted" ? "reviewed" : `review_${action ?? "unknown"}`;
  }
  if (githubEvent === "pull_request_review_comment") {
    return action === "created" ? "commented" : `review_comment_${action ?? "unknown"}`;
  }
  return action ?? githubEvent;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Only POST method is allowed" }, 405);
  }

  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return sizeErr;

  const githubEvent = req.headers.get("x-github-event") ?? "";
  const deliveryId = req.headers.get("x-github-delivery") ?? null;
  const signature = req.headers.get("x-hub-signature-256");

  if (!ALLOWED_EVENTS.has(githubEvent)) {
    return jsonResponse({ ok: true, skipped: githubEvent }, 200);
  }

  const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET");
  if (!secret) {
    console.error("gh-webhook: GITHUB_WEBHOOK_SECRET not configured");
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  const rawBody = await req.text();

  if (!(await verifySignature(secret, signature, rawBody))) {
    console.warn("gh-webhook: signature verification failed", {
      delivery: deliveryId,
      event: githubEvent,
    });
    return jsonResponse({ error: "invalid signature" }, 401);
  }

  if (githubEvent === "ping") {
    return jsonResponse({ ok: true, pong: true }, 200);
  }

  let payload: GithubPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const repoInfo = repoFromPayload(payload);
  if (!repoInfo) {
    return jsonResponse({ ok: true, skipped: "no repo in payload" }, 200);
  }

  const fullName = `${repoInfo.owner}/${repoInfo.repo}`.toLowerCase();
  if (ALLOWED_REPOS.size > 0 && !ALLOWED_REPOS.has(fullName)) {
    return jsonResponse({ ok: true, skipped: `repo not allowlisted: ${fullName}` }, 200);
  }

  const issue = issueFromPayload(payload);
  if (!issue) {
    return jsonResponse({ ok: true, skipped: "no issue in payload" }, 200);
  }

  const sb = createServiceClient();

  const labels = (issue.labels ?? []).map((l) => ({
    name: l.name,
    color: l.color,
  }));
  const assignees = (issue.assignees ?? []).map((a) => ({ login: a.login }));

  const upsertParams = {
    p_owner: repoInfo.owner,
    p_repo: repoInfo.repo,
    p_number: issue.number,
    p_title: issue.title,
    p_state: issue.state,
    p_body: issue.body ?? null,
    p_labels: labels,
    p_assignees: assignees,
    p_author: issue.user?.login ?? null,
    p_html_url: issue.html_url,
    p_is_pull_request: !!payload.pull_request || !!issue.pull_request,
    p_github_node_id: issue.node_id ?? null,
    p_github_created_at: issue.created_at,
    p_github_updated_at: issue.updated_at,
    p_closed_at: issue.closed_at ?? null,
  };

  const { error: upsertErr } = await sb
    .schema("gh")
    .rpc("upsert_issue", upsertParams);
  if (upsertErr) {
    console.error("gh.upsert_issue failed:", upsertErr.message);
    return jsonResponse({ error: "upsert failed" }, 500);
  }

  const eventActor = payload.sender?.login ?? payload.comment?.user?.login ?? null;
  const { error: eventErr } = await sb.schema("gh").rpc("record_event", {
    p_owner: repoInfo.owner,
    p_repo: repoInfo.repo,
    p_number: issue.number,
    p_event_type: mapEventType(githubEvent, payload.action),
    p_actor: eventActor,
    p_payload: payload,
    p_github_delivery_id: deliveryId,
  });
  if (eventErr) {
    console.error("gh.record_event failed:", eventErr.message);
  }

  return jsonResponse(
    {
      ok: true,
      event: githubEvent,
      action: payload.action,
      delivery: deliveryId,
      issue: `${fullName}#${issue.number}`,
    },
    200,
  );
});
