import {
  clampLimit,
  createServiceClient,
  type ForumRequest,
  jsonResponse,
  validateSlug,
} from "./_shared.ts";

export const TAG_ACTIONS = ["list", "get"];

type Handler = (req: ForumRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  async list({ body }) {
    const limit = clampLimit(body.limit, 100, 200);
    const supa = createServiceClient();
    const { data, error } = await supa.schema("forum").rpc("service_list_tags", {
      p_limit: limit,
    });
    if (error) {
      console.error("forum.tag.list error:", error);
      return jsonResponse({ error: "tag list failed" }, 502);
    }
    return jsonResponse({ tags: data ?? [] });
  },

  async get({ body }) {
    const slug = body.slug;
    const slugErr = validateSlug(slug, "slug");
    if (slugErr) return slugErr;
    const supa = createServiceClient();
    const { data, error } = await supa
      .schema("forum")
      .rpc("service_get_tag_by_slug", { p_slug: slug as string });
    if (error) {
      console.error("forum.tag.get error:", error);
      return jsonResponse({ error: "tag lookup failed" }, 502);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return jsonResponse({ error: "tag not found" }, 404);
    return jsonResponse({ tag: row });
  },
};

export async function handleTag(req: ForumRequest): Promise<Response> {
  const fn = handlers[req.action];
  if (!fn) {
    return jsonResponse(
      {
        error: `unknown action 'tag.${req.action}'. Available: ${
          TAG_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return fn(req);
}
