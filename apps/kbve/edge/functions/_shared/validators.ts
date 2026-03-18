// ---------------------------------------------------------------------------
// Shared validation utilities
//
// Guard pattern: return Response on failure, null on success.
// ---------------------------------------------------------------------------

import { jsonResponse } from "./supabase.ts";
import {
  ILLEGAL_CHARS_RE,
  MAX_URL_LENGTH,
} from "./formats.ts";

// ---------------------------------------------------------------------------
// Illegal character quick-reject
// ---------------------------------------------------------------------------

/**
 * Early exit if value contains characters that should never appear in
 * identifiers or keys (%, <, >, quotes, backslashes, control chars).
 * Call this before any DB/RPC call to short-circuit obviously bad input.
 */
export function rejectIllegalChars(
  value: string,
  field: string,
): Response | null {
  if (ILLEGAL_CHARS_RE.test(value)) {
    return jsonResponse(
      { error: `${field} contains illegal characters` },
      400,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// URL validation with SSRF protection
// ---------------------------------------------------------------------------

// RFC 1918 + loopback + link-local + IPv6 loopback patterns
const PRIVATE_HOSTNAME_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|\[fd[0-9a-f]{2}:.*\]|\[fe80:.*\])$/i;

/**
 * Validate a URL string:
 * - Must be a valid URL (parseable by `new URL()`)
 * - Must use HTTPS scheme
 * - Must not point to private/internal IP ranges (SSRF protection)
 * - Must not exceed MAX_URL_LENGTH
 */
export function validateSafeUrl(
  url: unknown,
  field: string,
  { required = true }: { required?: boolean } = {},
): Response | null {
  if (url === undefined || url === null) {
    if (required) {
      return jsonResponse({ error: `${field} is required` }, 400);
    }
    return null;
  }

  if (typeof url !== "string") {
    return jsonResponse({ error: `${field} must be a string` }, 400);
  }

  if (url.length > MAX_URL_LENGTH) {
    return jsonResponse(
      { error: `${field} exceeds maximum length of ${MAX_URL_LENGTH} characters` },
      400,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return jsonResponse({ error: `${field} must be a valid URL` }, 400);
  }

  if (parsed.protocol !== "https:") {
    return jsonResponse(
      { error: `${field} must be a valid HTTPS URL` },
      400,
    );
  }

  // SSRF: block private/internal hostnames
  if (PRIVATE_HOSTNAME_RE.test(parsed.hostname)) {
    return jsonResponse(
      { error: `${field} must not point to a private or internal address` },
      400,
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Content-Type validation
// ---------------------------------------------------------------------------

/**
 * Verify that the request has a JSON-compatible Content-Type header.
 * Returns a 415 response if the header is missing or wrong.
 */
export function requireJsonContentType(req: Request): Response | null {
  const ct = req.headers.get("content-type");
  if (!ct || !ct.includes("application/json")) {
    return jsonResponse(
      { error: "Content-Type must be application/json" },
      415,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Safe error message for client responses
// ---------------------------------------------------------------------------

/**
 * Sanitize an RPC/DB error for client consumption.
 * Logs the real error server-side, returns a generic message to the client.
 */
export function safeRpcError(
  error: { message: string },
  context: string,
  status = 400,
): Response {
  console.error(`${context}:`, error.message);
  return jsonResponse(
    { error: "Operation failed. Please try again or contact support." },
    status,
  );
}
