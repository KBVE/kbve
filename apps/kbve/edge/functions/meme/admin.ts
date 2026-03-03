import {
  createServiceClient,
  jsonResponse,
  type MemeRequest,
  requireServiceRole,
  validateTag,
} from "./_shared.ts";

// ---------------------------------------------------------------------------
// Meme Admin Module — service_role only
//
// Actions:
//   create  -- Insert a new meme (URL reference + metadata)
// ---------------------------------------------------------------------------

const HTTPS_RE = /^https:\/\/.+/;
const HEX_RE = /^[a-f0-9]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  async create({ claims, body }) {
    // Gate: service_role only
    const roleErr = requireServiceRole(claims);
    if (roleErr) return roleErr;

    const {
      author_id,
      asset_url,
      title,
      format,
      thumbnail_url,
      width,
      height,
      file_size,
      tags,
      source_url,
      alt_text,
      content_hash,
      status,
    } = body;

    // --- Belt: edge-level validation ---

    // author_id: required UUID
    if (!author_id || typeof author_id !== "string") {
      return jsonResponse({ error: "author_id is required" }, 400);
    }
    if (!UUID_RE.test(author_id)) {
      return jsonResponse({ error: "author_id must be a valid UUID" }, 400);
    }

    // asset_url: required HTTPS URL
    if (!asset_url || typeof asset_url !== "string") {
      return jsonResponse({ error: "asset_url is required" }, 400);
    }
    if (
      !HTTPS_RE.test(asset_url) ||
      asset_url.length > 2048
    ) {
      return jsonResponse(
        { error: "asset_url must be a valid HTTPS URL (max 2048 chars)" },
        400,
      );
    }

    // title: optional, max 200 chars
    if (title !== undefined && title !== null) {
      if (typeof title !== "string" || title.length > 200) {
        return jsonResponse(
          { error: "title must be a string of at most 200 characters" },
          400,
        );
      }
    }

    // format: optional, 0-4
    const safeFormat = format !== undefined ? Number(format) : 0;
    if (
      !Number.isInteger(safeFormat) || safeFormat < 0 || safeFormat > 4
    ) {
      return jsonResponse(
        {
          error:
            "format must be 0 (unspecified), 1 (image), 2 (gif), 3 (video), or 4 (webp_anim)",
        },
        400,
      );
    }

    // thumbnail_url: optional HTTPS
    if (thumbnail_url !== undefined && thumbnail_url !== null) {
      if (
        typeof thumbnail_url !== "string" ||
        !HTTPS_RE.test(thumbnail_url) ||
        thumbnail_url.length > 2048
      ) {
        return jsonResponse(
          { error: "thumbnail_url must be a valid HTTPS URL" },
          400,
        );
      }
    }

    // source_url: optional HTTPS
    if (source_url !== undefined && source_url !== null) {
      if (
        typeof source_url !== "string" ||
        !HTTPS_RE.test(source_url) ||
        source_url.length > 2048
      ) {
        return jsonResponse(
          { error: "source_url must be a valid HTTPS URL" },
          400,
        );
      }
    }

    // width/height: optional positive integers
    const safeWidth = width !== undefined ? Number(width) : null;
    if (
      safeWidth !== null && (!Number.isInteger(safeWidth) || safeWidth <= 0)
    ) {
      return jsonResponse({ error: "width must be a positive integer" }, 400);
    }

    const safeHeight = height !== undefined ? Number(height) : null;
    if (
      safeHeight !== null && (!Number.isInteger(safeHeight) || safeHeight <= 0)
    ) {
      return jsonResponse({ error: "height must be a positive integer" }, 400);
    }

    // file_size: optional positive integer
    const safeFileSize = file_size !== undefined ? Number(file_size) : null;
    if (
      safeFileSize !== null &&
      (!Number.isInteger(safeFileSize) || safeFileSize <= 0)
    ) {
      return jsonResponse(
        { error: "file_size must be a positive integer" },
        400,
      );
    }

    // tags: optional array of slug-safe strings
    if (tags !== undefined && tags !== null) {
      if (!Array.isArray(tags)) {
        return jsonResponse({ error: "tags must be an array" }, 400);
      }
      if (tags.length > 20) {
        return jsonResponse({ error: "tags exceeds maximum of 20" }, 400);
      }
      for (const tag of tags) {
        const tagErr = validateTag(tag);
        if (tagErr) return tagErr;
      }
    }

    // alt_text: optional, max 500 chars
    if (alt_text !== undefined && alt_text !== null) {
      if (typeof alt_text !== "string" || alt_text.length > 500) {
        return jsonResponse(
          { error: "alt_text must be a string of at most 500 characters" },
          400,
        );
      }
    }

    // content_hash: optional hex string
    if (content_hash !== undefined && content_hash !== null) {
      if (
        typeof content_hash !== "string" ||
        content_hash.length > 128 ||
        !HEX_RE.test(content_hash)
      ) {
        return jsonResponse(
          { error: "content_hash must be lowercase hex, max 128 chars" },
          400,
        );
      }
    }

    // status: optional, 1 (draft), 2 (pending), or 3 (published)
    const safeStatus = status !== undefined ? Number(status) : 1;
    if (
      !Number.isInteger(safeStatus) ||
      ![1, 2, 3].includes(safeStatus)
    ) {
      return jsonResponse(
        { error: "status must be 1 (draft), 2 (pending), or 3 (published)" },
        400,
      );
    }

    // --- Suspenders: let the DB RPC + table constraints do their job ---

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_create_meme", {
      p_author_id: author_id as string,
      p_asset_url: asset_url as string,
      p_title: (title as string) ?? null,
      p_format: safeFormat,
      p_thumbnail_url: (thumbnail_url as string) ?? null,
      p_width: safeWidth,
      p_height: safeHeight,
      p_file_size: safeFileSize,
      p_tags: (tags as string[]) ?? [],
      p_source_url: (source_url as string) ?? null,
      p_alt_text: (alt_text as string) ?? null,
      p_content_hash: (content_hash as string) ?? null,
      p_status: safeStatus,
    });

    if (error) {
      console.error("service_create_meme error:", error);
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
      success: true,
      meme_id: data,
    });
  },
};

export const ADMIN_ACTIONS = Object.keys(handlers);

export async function handleAdmin(memeReq: MemeRequest): Promise<Response> {
  const handler = handlers[memeReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown admin action: ${memeReq.action}. Use: ${
          ADMIN_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(memeReq);
}
