// Re-export the centralized supabase utilities for the forum edge group.
export {
  createServiceClient,
  extractToken,
  jsonResponse,
  type JwtClaims,
  parseJwt,
} from "../_shared/supabase.ts";

import { jsonResponse } from "../_shared/supabase.ts";

export interface ForumRequest {
  // Verified caller identity. Anon role is allowed on every read in
  // this group; we only carry the claims so handlers can branch on
  // role if a future write action needs it.
  claims: { role?: string; sub?: string };
  body: Record<string, unknown>;
  action: string;
}

// Slug grammar mirrors the forum.spaces / forum.tags CHECK constraint.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function validateSlug(value: unknown, field: string): Response | null {
  if (typeof value !== "string" || value.length === 0) {
    return jsonResponse({ error: `${field} is required` }, 400);
  }
  if (value.length > 50 || !SLUG_RE.test(value)) {
    return jsonResponse(
      { error: `${field} must match ^[a-z0-9][a-z0-9-]*$ (≤50 chars)` },
      400,
    );
  }
  return null;
}

export function clampLimit(value: unknown, def: number, max: number): number {
  if (value === undefined || value === null) return def;
  const num = Number(value);
  if (!Number.isFinite(num)) return def;
  return Math.min(Math.max(Math.trunc(num), 1), max);
}
