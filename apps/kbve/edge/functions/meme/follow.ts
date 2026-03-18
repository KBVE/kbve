import {
  createServiceClient,
  jsonResponse,
  type MemeRequest,
  requireAuthenticated,
  validateUserId,
} from "./_shared.ts";
import { safeRpcError } from "../_shared/validators.ts";

// ---------------------------------------------------------------------------
// Meme Follow Module
//
// Actions:
//   add    -- Follow a user (auth required)
//   remove -- Unfollow a user (auth required)
// ---------------------------------------------------------------------------

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  async add({ claims, body }) {
    const denied = requireAuthenticated(claims);
    if (denied) return denied;

    const userId = claims.sub;

    const { following_id } = body;
    const idErr = validateUserId(following_id, "following_id");
    if (idErr) return idErr;

    // Prevent self-follow at edge layer (CHECK constraint is backup)
    if (following_id === userId) {
      return jsonResponse(
        { error: "You cannot follow yourself" },
        400,
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_follow", {
      p_follower_id: userId,
      p_following_id: following_id as string,
    });

    if (error) {
      return safeRpcError(error, "service_follow");
    }

    return jsonResponse({ success: true, is_new: data });
  },

  async remove({ claims, body }) {
    const denied = requireAuthenticated(claims);
    if (denied) return denied;

    const userId = claims.sub;

    const { following_id } = body;
    const idErr = validateUserId(following_id, "following_id");
    if (idErr) return idErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_unfollow", {
      p_follower_id: userId,
      p_following_id: following_id as string,
    });

    if (error) {
      return safeRpcError(error, "service_unfollow");
    }

    return jsonResponse({ success: true, was_following: data });
  },
};

export const FOLLOW_ACTIONS = Object.keys(handlers);

export async function handleFollow(
  memeReq: MemeRequest,
): Promise<Response> {
  const handler = handlers[memeReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown follow action: ${memeReq.action}. Use: ${
          FOLLOW_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(memeReq);
}
