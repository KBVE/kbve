import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";
import { corsHeaders } from "./cors.ts";

// ---------------------------------------------------------------------------
// Shared Supabase utilities for all edge function modules
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("JWT_SECRET");

export interface JwtClaims {
  role?: string;
  sub?: string;
  [key: string]: unknown;
}

export async function parseJwt(token: string): Promise<JwtClaims> {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  const key = new TextEncoder().encode(JWT_SECRET);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  return payload as JwtClaims;
}

export function extractToken(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }
  return authHeader.slice(7);
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createUserClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function requireUserToken(claims: JwtClaims): Response | null {
  if (claims.role === "service_role") {
    return jsonResponse(
      { error: "Use an authenticated user token, not service_role" },
      403,
    );
  }
  return null;
}

export function requireServiceRole(claims: JwtClaims): Response | null {
  if (claims.role !== "service_role") {
    return jsonResponse(
      { error: "Access denied: service_role required" },
      403,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Staff permission helpers
//
// Mirrors the bitwise permission system in staff.members.permissions.
// Uses the public.staff_permissions() RPC to resolve the caller's bitmask.
// ---------------------------------------------------------------------------

export const staffPerm = {
  STAFF: 0x0000_0001,
  MODERATOR: 0x0000_0002,
  ADMIN: 0x0000_0004,
  DASHBOARD_VIEW: 0x0000_0100,
  DASHBOARD_MANAGE: 0x0000_0200,
  SUPERADMIN: 0x4000_0000,
} as const;

/**
 * Call public.staff_permissions() RPC as the given user.
 * Returns the integer permission bitmask (0 = not staff).
 */
export async function checkStaffPermissions(
  token: string,
): Promise<number> {
  const client = createUserClient(token);
  const { data, error } = await client.rpc("staff_permissions");
  if (error) {
    console.error("staff_permissions RPC error:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/**
 * Guard: allow service_role OR any user with staff permissions > 0.
 * Returns a 403 Response if denied, null if allowed.
 */
export async function requireStaffOrServiceRole(
  token: string,
  claims: JwtClaims,
): Promise<Response | null> {
  if (claims.role === "service_role") return null;

  const permissions = await checkStaffPermissions(token);
  if (permissions > 0) return null;

  return jsonResponse(
    { error: "Access denied: staff or service_role required" },
    403,
  );
}
