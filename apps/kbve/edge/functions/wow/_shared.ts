export {
  AuthError,
  createServiceClient,
  createUserClient,
  extractToken,
  jsonResponse,
  type JwtClaims,
  parseJwt,
  requireServiceRole,
  requireUserToken,
} from "../_shared/supabase.ts";

import { jsonResponse } from "../_shared/supabase.ts";

export interface WowRequest {
  token: string;
  claims: import("../_shared/supabase.ts").JwtClaims;
  body: Record<string, unknown>;
  action: string;
}

// AzerothCore uppercases the account name before folding it into the SRP6
// identity, so anything we accept here has to already be in the form the
// server will hash. Bounds match wow.account's CHECK constraint.
const USERNAME_RE = /^[A-Z0-9_-]{3,16}$/;

// salt and verifier are both 32 bytes, hex-encoded uppercase — the shape
// wow-srp6.ts emits and the width of acore_auth.account's binary columns.
const HEX32_RE = /^[0-9A-F]{64}$/;

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return USERNAME_RE.test(upper) ? upper : null;
}

export function validateUsername(value: unknown): Response | null {
  if (normalizeUsername(value) === null) {
    return jsonResponse(
      { error: "username must be 3-16 characters of A-Z, 0-9, _ or -" },
      400,
    );
  }
  return null;
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
