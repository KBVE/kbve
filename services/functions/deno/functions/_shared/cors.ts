// Allowed origins for CORS — restricts which sites can make authenticated
// requests to edge functions. Add new origins as needed.
const ALLOWED_ORIGINS = new Set([
  "https://kbve.com",
  "https://www.kbve.com",
  "https://app.kbve.com",
  "https://chuckrpg.com",
  "https://www.chuckrpg.com",
  "https://herbmail.com",
  "https://www.herbmail.com",
  "https://chat.kbve.com",
  "http://localhost:3000",
  "http://localhost:4321",
  "http://localhost:1420",
  "https://localhost:3080",
]);

const BASE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

/**
 * Build CORS headers for a given request origin.
 * Returns the origin if it's in the allowlist, otherwise omits the header
 * (browser will block the response as a CORS violation).
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    ...BASE_CORS_HEADERS,
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
  };
}

/**
 * Default CORS headers with NO `Access-Control-Allow-Origin`. Cross-origin
 * browser reads are blocked unless the response is passed through `withCors`
 * with the originating request. Used by `jsonResponse` as a safe baseline.
 */
export const corsHeaders = BASE_CORS_HEADERS;

/**
 * Merge origin-aware CORS headers onto an existing Response at the router
 * boundary, so allowlisted browser origins receive a matching
 * `Access-Control-Allow-Origin` without threading the request through every
 * handler.
 */
export function withCors(res: Response, req: Request): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(getCorsHeaders(req))) {
    headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/** Standard preflight response for OPTIONS requests. */
export function preflight(req: Request): Response {
  return new Response("ok", { headers: getCorsHeaders(req) });
}
