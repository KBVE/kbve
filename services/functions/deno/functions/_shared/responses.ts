/**
 * Standard success/error response envelopes.
 *
 * Convention for new handlers: `{ success: true, data: <payload> }` for
 * success and `{ success: false, error: <message> }` for failures. Existing
 * handlers keep their wire shapes for client compatibility; adopt these helpers
 * for any new endpoint.
 */

import { jsonResponse } from "./supabase.ts";

/** `{ success: true, data }` envelope. */
export function successResponse(data: unknown, status = 200): Response {
  return jsonResponse({ success: true, data }, status);
}

/** `{ success: false, error }` envelope. */
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}
