import {
  clampLimit,
  createServiceClient,
  type ForumRequest,
  jsonResponse,
  validateSlug,
} from "./_shared.ts";

export const THREAD_ACTIONS = ["list", "get", "tags"];

type Handler = (req: ForumRequest) => Promise<Response>;

const SORTS = new Set(["hot", "new", "top", "bump"]);

const handlers: Record<string, Handler> = {
  // Cursor-paginated feed. Mirrors axum's render_feed_page params.
  async list({ body }) {
    const sort = typeof body.sort === "string" && SORTS.has(body.sort)
      ? body.sort
      : "hot";
    const limit = clampLimit(body.limit, 25, 100);
    const cursor = typeof body.cursor === "string" ? body.cursor : null;
    const space_slug = typeof body.space_slug === "string"
      ? body.space_slug
      : null;
    const tag_id = body.tag_id !== undefined && body.tag_id !== null
      ? Number(body.tag_id)
      : null;

    const supa = createServiceClient();

    // Resolve space slug → id if provided.
    let space_id: string | null = null;
    if (space_slug) {
      const slugErr = validateSlug(space_slug, "space_slug");
      if (slugErr) return slugErr;
      const { data: spaceRow, error: spaceErr } = await supa
        .schema("forum")
        .from("spaces")
        .select("id")
        .eq("slug", space_slug)
        .eq("status", "active")
        .maybeSingle();
      if (spaceErr) {
        console.error("forum.thread.list space resolve error:", spaceErr);
        return jsonResponse({ error: "space resolve failed" }, 502);
      }
      if (!spaceRow) return jsonResponse({ error: "space not found" }, 404);
      space_id = spaceRow.id;
    }

    const { data, error } = await supa
      .schema("forum")
      .rpc("service_fetch_feed", {
        p_space_id: space_id,
        p_tag_id: tag_id,
        p_thread_type: null,
        p_sort: sort,
        p_cursor: cursor,
        p_limit: limit,
        p_include_nsfw: false,
      });
    if (error) {
      console.error("forum.thread.list error:", error);
      return jsonResponse({ error: "feed fetch failed" }, 502);
    }
    return jsonResponse({ threads: data ?? [], sort, limit });
  },

  // Resolve a thread by ULID or slug. Returns the thread row + space.
  async get({ body }) {
    const slugOrId = body.slug_or_id;
    if (typeof slugOrId !== "string" || !slugOrId) {
      return jsonResponse({ error: "slug_or_id is required" }, 400);
    }
    if (slugOrId.length > 64) {
      return jsonResponse({ error: "slug_or_id too long" }, 400);
    }
    const looksLikeUlid = slugOrId.length === 26 &&
      /^[0-9A-HJKMNP-TV-Z]+$/i.test(slugOrId);

    const supa = createServiceClient();
    const query = supa
      .schema("forum")
      .from("threads")
      .select("*,space:spaces(id,slug,name,description,status)")
      .neq("status", "removed")
      .limit(1);
    const { data, error } = await (looksLikeUlid
      ? query.eq("id", slugOrId)
      : query.eq("slug", slugOrId)
    ).maybeSingle();
    if (error) {
      console.error("forum.thread.get error:", error);
      return jsonResponse({ error: "thread lookup failed" }, 502);
    }
    if (!data) return jsonResponse({ error: "thread not found" }, 404);
    return jsonResponse({ thread: data });
  },

  // Per-thread tag chips. Uses the same RPC the axum render path does.
  async tags({ body }) {
    const threadId = body.thread_id;
    if (typeof threadId !== "string" || !threadId || threadId.length > 64) {
      return jsonResponse({ error: "thread_id is required" }, 400);
    }
    const supa = createServiceClient();
    const { data, error } = await supa
      .schema("forum")
      .rpc("service_get_thread_tags", { p_thread_id: threadId });
    if (error) {
      console.error("forum.thread.tags error:", error);
      return jsonResponse({ error: "thread tags failed" }, 502);
    }
    return jsonResponse({ tags: data ?? [] });
  },
};

export async function handleThread(req: ForumRequest): Promise<Response> {
  const fn = handlers[req.action];
  if (!fn) {
    return jsonResponse(
      {
        error: `unknown action 'thread.${req.action}'. Available: ${
          THREAD_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return fn(req);
}
