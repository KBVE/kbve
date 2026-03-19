import {
  createServiceClient,
  extractUserId,
  jsonResponse,
  type MemeRequest,
  validateCommentBody,
  validateCursor,
  validateLimit,
  validateMemeId,
} from "./_shared.ts";
import { safeRpcError } from "../_shared/validators.ts";

// ---------------------------------------------------------------------------
// Meme Comment Module
//
// Actions:
//   list    -- Fetch top-level comments for a meme (anonymous OK)
//   replies -- Fetch replies to a comment (anonymous OK)
//   create  -- Post a comment or reply (auth required)
//   delete  -- Delete own comment (auth required)
// ---------------------------------------------------------------------------

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  async list({ body }) {
    const { meme_id, limit, cursor } = body;

    const memeErr = validateMemeId(meme_id);
    if (memeErr) return memeErr;

    const { value: safeLimit, error: limitErr } = validateLimit(limit);
    if (limitErr) return limitErr;

    const cursorErr = validateCursor(cursor);
    if (cursorErr) return cursorErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_fetch_comments", {
      p_meme_id: meme_id as string,
      p_limit: safeLimit,
      p_cursor: (cursor as string) ?? null,
    });

    if (error) {
      return safeRpcError(error, "service_fetch_comments");
    }

    const comments = Array.isArray(data) ? data : [];
    const hasMore = comments.length === safeLimit;
    const nextCursor = hasMore && comments.length > 0
      ? comments[comments.length - 1].id
      : null;

    return jsonResponse({ comments, nextCursor, hasMore });
  },

  async replies({ body }) {
    const { parent_id, limit, cursor } = body;

    const parentErr = validateMemeId(parent_id, "parent_id");
    if (parentErr) return parentErr;

    const { value: safeLimit, error: limitErr } = validateLimit(limit);
    if (limitErr) return limitErr;

    const cursorErr = validateCursor(cursor);
    if (cursorErr) return cursorErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_fetch_replies", {
      p_parent_id: parent_id as string,
      p_limit: safeLimit,
      p_cursor: (cursor as string) ?? null,
    });

    if (error) {
      return safeRpcError(error, "service_fetch_replies");
    }

    const replies = Array.isArray(data) ? data : [];
    const hasMore = replies.length === safeLimit;
    const nextCursor = hasMore && replies.length > 0
      ? replies[replies.length - 1].id
      : null;

    return jsonResponse({ replies, nextCursor, hasMore });
  },

  async create({ body }) {
    const { userId, error: userErr } = extractUserId(body);
    if (userErr) return userErr;

    const { meme_id, body: commentBody, parent_id } = body;
    const memeErr = validateMemeId(meme_id);
    if (memeErr) return memeErr;

    const bodyErr = validateCommentBody(commentBody);
    if (bodyErr) return bodyErr;

    if (parent_id !== undefined && parent_id !== null) {
      const parentErr = validateMemeId(parent_id, "parent_id");
      if (parentErr) return parentErr;
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_create_comment", {
      p_user_id: userId,
      p_meme_id: meme_id as string,
      p_body: (commentBody as string).trim(),
      p_parent_id: (parent_id as string) ?? null,
    });

    if (error) {
      return safeRpcError(error, "service_create_comment");
    }

    return jsonResponse({ success: true, comment_id: data });
  },

  async delete({ body }) {
    const { userId, error: userErr } = extractUserId(body);
    if (userErr) return userErr;

    const { comment_id } = body;
    const idErr = validateMemeId(comment_id, "comment_id");
    if (idErr) return idErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_delete_comment", {
      p_user_id: userId,
      p_comment_id: comment_id as string,
    });

    if (error) {
      return safeRpcError(error, "service_delete_comment");
    }

    if (!data) {
      return jsonResponse(
        {
          success: false,
          error: "Comment not found or not yours",
        },
        404,
      );
    }

    return jsonResponse({ success: true });
  },
};

export const COMMENT_ACTIONS = Object.keys(handlers);

export async function handleComment(
  memeReq: MemeRequest,
): Promise<Response> {
  const handler = handlers[memeReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown comment action: ${memeReq.action}. Use: ${
          COMMENT_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(memeReq);
}
