/**
 * Auth guard middleware.
 *
 * Wraps an action handler with a role check so individual handlers no longer
 * repeat `requireServiceRole(claims)` / `requireUserToken(claims)` boilerplate.
 */

import type { JwtClaims } from "./supabase.ts";
import {
  requireServiceRole,
  requireStaffOrServiceRole,
  requireUserToken,
} from "./supabase.ts";

/** Minimal shape every module request context shares. */
export interface AuthedRequest {
  token: string;
  claims: JwtClaims;
}

export type Role = "user" | "service_role" | "staff";

/**
 * Wrap a handler so the given role is enforced before it runs. Returns a 403
 * Response when the caller's role is insufficient.
 *
 *   const cast = withAuth("user", async (req) => { ... });
 */
export function withAuth<R extends AuthedRequest>(
  role: Role,
  handler: (req: R) => Promise<Response>,
): (req: R) => Promise<Response> {
  return async (req: R): Promise<Response> => {
    let denied: Response | null = null;
    switch (role) {
      case "user":
        denied = requireUserToken(req.claims);
        break;
      case "service_role":
        denied = requireServiceRole(req.claims);
        break;
      case "staff":
        denied = await requireStaffOrServiceRole(req.token, req.claims);
        break;
    }
    if (denied) return denied;
    return handler(req);
  };
}
