import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@clickhouse/client-web@1.8.1";
import { corsHeaders } from "../_shared/cors.ts";
import {
  extractToken,
  jsonResponse,
  parseJwt,
  requireServiceRole,
} from "../_shared/supabase.ts";
import { requireJsonContentType } from "../_shared/validators.ts";

// ---------------------------------------------------------------------------
// Logs Edge Function — Query observability.logs_raw in ClickHouse
//
// Auth: service_role only (admin/staff access)
//
// POST /logs  { command, ...params }
//   query   — search logs with filters
//   stats   — namespace/service counts
// ---------------------------------------------------------------------------

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
const MAX_MINUTES = 10080; // 7 days
const MAX_SEARCH_LENGTH = 100;

const ch = createClient({
  url: Deno.env.get("CLICKHOUSE_ENDPOINT") ?? "",
  username: Deno.env.get("CLICKHOUSE_USER") ?? "",
  password: Deno.env.get("CLICKHOUSE_PASSWORD") ?? "",
  database: "observability",
});

interface QueryParams {
  pod_namespace?: string;
  service?: string;
  level?: string;
  search?: string;
  minutes?: number;
  limit?: number;
}

async function handleQuery(params: QueryParams) {
  const conditions: string[] = [];
  const queryParams: Record<string, unknown> = {};

  const minutes = Math.min(Math.max(params.minutes ?? 60, 1), MAX_MINUTES);
  conditions.push("timestamp > now() - INTERVAL {minutes:UInt32} MINUTE");
  queryParams.minutes = minutes;

  if (params.pod_namespace) {
    conditions.push("pod_namespace = {ns:String}");
    queryParams.ns = params.pod_namespace;
  }

  if (params.service) {
    conditions.push("service = {svc:String}");
    queryParams.svc = params.service;
  }

  if (params.level) {
    conditions.push("level = {lvl:String}");
    queryParams.lvl = params.level.toLowerCase();
  }

  if (params.search) {
    // Limit search length to prevent wildcard abuse
    const search = String(params.search).slice(0, MAX_SEARCH_LENGTH);
    conditions.push("message ILIKE {search:String}");
    queryParams.search = `%${search}%`;
  }

  const limit = Math.min(
    Math.max(params.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const resultSet = await ch.query({
    query: `
      SELECT timestamp, pod_namespace, service, level,
             message, pod_name, metadata
      FROM logs_raw
      ${where}
      ORDER BY timestamp DESC
      LIMIT {lim:UInt32}
    `,
    query_params: { ...queryParams, lim: limit },
    format: "JSONEachRow",
  });

  const rows = await resultSet.json();
  return { rows, count: rows.length };
}

async function handleStats(params: { minutes?: number }) {
  const minutes = Math.min(Math.max(params.minutes ?? 60, 1), MAX_MINUTES);

  const resultSet = await ch.query({
    query: `
      SELECT pod_namespace, service, level, count() as cnt
      FROM logs_raw
      WHERE timestamp > now() - INTERVAL {minutes:UInt32} MINUTE
      GROUP BY pod_namespace, service, level
      ORDER BY cnt DESC
      LIMIT 200
    `,
    query_params: { minutes },
    format: "JSONEachRow",
  });

  const rows = await resultSet.json();
  return { rows, count: rows.length };
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

  try {
    const token = extractToken(req);
    const claims = await parseJwt(token);

    const denied = requireServiceRole(claims);
    if (denied) return denied;

    const body = await req.json();
    const { command, ...params } = body;

    if (!command || typeof command !== "string") {
      return jsonResponse(
        { error: 'command is required ("query" or "stats")' },
        400,
      );
    }

    let result: unknown;

    switch (command) {
      case "query":
        result = await handleQuery(params as QueryParams);
        break;
      case "stats":
        result = await handleStats(params);
        break;
      default:
        return jsonResponse(
          { error: `Unknown command: ${command}. Use "query" or "stats"` },
          400,
        );
    }

    return jsonResponse(result);
  } catch (err) {
    console.error("logs error:", err);
    const rawMessage =
      err instanceof Error ? err.message : "Internal server error";
    const isAuthError =
      rawMessage.includes("authorization") || rawMessage.includes("JWT");
    if (isAuthError) {
      return jsonResponse({ error: rawMessage }, 401);
    }
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
