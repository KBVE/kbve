export {
  AuthError,
  createServiceClient,
  createUserClient,
  extractToken,
  jsonResponse,
  type JwtClaims,
  parseJwt,
  requireServiceRole,
  requireStaffOrServiceRole,
  requireUserToken,
  staffPerm,
} from "../_shared/supabase.ts";

import { jsonResponse } from "../_shared/supabase.ts";

export interface WowRequest {
  token: string;
  claims: import("../_shared/supabase.ts").JwtClaims;
  body: Record<string, unknown>;
  action: string;
}

// AzerothCore uppercases the account name before folding it into the SRP6
// identity, so anything that reaches MySQL has to already be in the form the
// server will hash. Bounds match wow.account's CHECK constraint, whose upper
// bound is the 3.3.5a login box rather than acore's varchar(32).
const USERNAME_RE = /^[A-Z0-9_-]{3,16}$/;

// salt and verifier are both 32 bytes, hex-encoded uppercase — the shape
// wow-srp6.ts emits and the width of acore_auth.account's binary columns.
const HEX32_RE = /^[0-9A-F]{64}$/;

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return USERNAME_RE.test(upper) ? upper : null;
}

export function validateHex32(value: unknown, field: string): Response | null {
  if (typeof value !== "string" || !HEX32_RE.test(value.toUpperCase())) {
    return jsonResponse(
      { error: `${field} must be 64 uppercase hex characters` },
      400,
    );
  }
  return null;
}
