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

/**
 * Build CORS headers for a given request origin.
 * Returns the origin if it's in the allowlist, otherwise omits the header
 * (browser will block the response as a CORS violation).
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

/** Legacy export for routers that don't pass the request object yet. */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
