import {
  createServiceClient,
  extractToken,
  jsonResponse,
  parseJwt,
  requireServiceRole,
  type JwtClaims,
} from "../_shared/supabase.ts";

export { createServiceClient, extractToken, jsonResponse, parseJwt };

// ---------------------------------------------------------------------------
// OWS Edge Function — Shared Types & Helpers
// ---------------------------------------------------------------------------

export interface OwsRequest {
  token: string;
  claims: JwtClaims;
  body: Record<string, unknown>;
  action: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(value: unknown, field: string): Response | null {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    return jsonResponse({ error: `${field} must be a valid UUID` }, 400);
  }
  return null;
}

export function validateCharName(
  value: unknown,
  field: string,
): Response | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 50) {
    return jsonResponse(
      { error: `${field} must be a string between 1 and 50 characters` },
      400,
    );
  }
  if (/[<>"'\\%;]/.test(value)) {
    return jsonResponse(
      { error: `${field} contains illegal characters` },
      400,
    );
  }
  return null;
}

export function requireAdmin(claims: JwtClaims): Response | null {
  return requireServiceRole(claims);
}
