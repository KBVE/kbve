import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, withCors } from "../_shared/cors.ts";
import { logError } from "../_shared/logging.ts";
import { rateLimit, rateLimitKey } from "../_shared/ratelimit.ts";
import { loadEnv } from "../_shared/env.ts";
import { enforceBodySizeLimit } from "../_shared/validators.ts";
import {
  extractToken,
  jsonResponse,
  parseJwt,
  requireStaffOrServiceRole,
} from "../_shared/supabase.ts";

// ---------------------------------------------------------------------------
// Argo Edge Function — Proxy to ArgoCD API with diagnostics
//
// Auth: service_role OR staff (permissions > 0)
//
// POST /argo  { command, ...params }
//   applications  — list all ArgoCD applications
//   app-status    — get single app status { name }
//   health        — ArgoCD server health check
// ---------------------------------------------------------------------------

const env = loadEnv(["ARGOCD_UPSTREAM_URL", "ARGOCD_AUTH_TOKEN"]);
const ARGOCD_URL = env.ARGOCD_UPSTREAM_URL;
const ARGOCD_TOKEN = env.ARGOCD_AUTH_TOKEN;

async function argoFetch(
  path: string,
  timeoutMs = 30000,
): Promise<{ status: number; body: unknown; elapsed: number; size: number }> {
  const url = `${ARGOCD_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const start = performance.now();
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ARGOCD_TOKEN}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const text = await resp.text();
    const elapsed = Math.round(performance.now() - start);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 1024) };
    }

    return { status: resp.status, body, elapsed, size: text.length };
  } catch (err) {
    logError("argo", err);
    const elapsed = Math.round(performance.now() - start);
    return {
      status: 0,
      body: { error: "Upstream request failed" },
      elapsed,
      size: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handleApplications(): Promise<Record<string, unknown>> {
  const result = await argoFetch("/api/v1/applications");
  const apps =
    result.status === 200 && typeof result.body === "object" && result.body
      ? (result.body as Record<string, unknown>)
      : null;

  const items = Array.isArray(apps?.items) ? apps.items : [];

  return {
    upstream_status: result.status,
    upstream_elapsed_ms: result.elapsed,
    upstream_size_bytes: result.size,
    app_count: items.length,
    applications: items.map((app: Record<string, unknown>) => {
      const meta = app.metadata as Record<string, unknown> | undefined;
      const status = app.status as Record<string, unknown> | undefined;
      const health = status?.health as Record<string, unknown> | undefined;
      const sync = status?.sync as Record<string, unknown> | undefined;
      return {
        name: meta?.name,
        namespace: meta?.namespace,
        health: health?.status,
        sync: sync?.status,
      };
    }),
  };
}

async function handleAppStatus(name: string): Promise<Record<string, unknown>> {
  const result = await argoFetch(`/api/v1/applications/${encodeURIComponent(name)}`);
  return {
    upstream_status: result.status,
    upstream_elapsed_ms: result.elapsed,
    upstream_size_bytes: result.size,
    application: result.body,
  };
}

async function handleHealth(): Promise<Record<string, unknown>> {
  const result = await argoFetch("/healthz", 10000);
  return {
    argocd_reachable: result.status === 200,
    upstream_status: result.status,
    upstream_elapsed_ms: result.elapsed,
    upstream_configured: !!ARGOCD_URL,
    timestamp: new Date().toISOString(),
  };
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Only POST method is allowed" }, 405);
  }

  try {
    const token = extractToken(req);
    const claims = await parseJwt(token);

    const rl = rateLimit(
      rateLimitKey("argo", req, claims?.sub as string | undefined),
      { limit: 30, windowMs: 60_000 },
    );
    if (rl) return rl;

    const denied = await requireStaffOrServiceRole(token, claims);
    if (denied) return denied;

    const sizeErr = enforceBodySizeLimit(req);
    if (sizeErr) return sizeErr;

    const body = await req.json();
    const { command, ...params } = body;

    if (!command || typeof command !== "string") {
      return jsonResponse(
        { error: 'command is required ("applications", "app-status", or "health")' },
        400,
      );
    }

    let result: unknown;

    switch (command) {
      case "applications":
        result = await handleApplications();
        break;
      case "app-status": {
        const name = params.name;
        if (!name || typeof name !== "string") {
          return jsonResponse({ error: "name is required for app-status" }, 400);
        }
        result = await handleAppStatus(name);
        break;
      }
      case "health":
        result = await handleHealth();
        break;
      default:
        return jsonResponse(
          { error: `Unknown command: ${command}. Use "applications", "app-status", or "health"` },
          400,
        );
    }

    return jsonResponse(result);
  } catch (err) {
    logError("argo", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("authorization") || message.includes("JWT") ? 401 : 500;
    return jsonResponse(
      { error: status === 401 ? "Unauthorized" : "Internal server error" },
      status,
    );
  }
}

serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return preflight(req);
  }
  return withCors(await handle(req), req);
});
