import {
  createServiceClient,
  type ForumRequest,
  jsonResponse,
  validateSlug,
} from "./_shared.ts";

// Read-only space queries. RLS already permits anon SELECT on
// non-suspended rows; we go through service_role here so we stay
// consistent with the rest of the forum group + can drop in
// service-role-only RPCs later (e.g. moderation views).

export const SPACE_ACTIONS = ["list", "get"];

type Handler = (req: ForumRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  async list() {
    const supa = createServiceClient();
    const { data, error } = await supa
      .schema("forum")
      .from("spaces")
      .select("id,slug,name,description,status")
      .eq("status", "active")
      .order("slug", { ascending: true })
      .limit(200);
    if (error) {
      console.error("forum.space.list error:", error);
      return jsonResponse({ error: "spaces lookup failed" }, 502);
    }
    return jsonResponse({ spaces: data ?? [] });
  },

  async get({ body }) {
    const slug = body.slug;
    const slugErr = validateSlug(slug, "slug");
    if (slugErr) return slugErr;
    const supa = createServiceClient();
    const { data, error } = await supa
      .schema("forum")
      .from("spaces")
      .select("id,slug,name,description,status")
      .eq("slug", slug as string)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      console.error("forum.space.get error:", error);
      return jsonResponse({ error: "space lookup failed" }, 502);
    }
    if (!data) return jsonResponse({ error: "space not found" }, 404);
    return jsonResponse({ space: data });
  },
};

export async function handleSpace(req: ForumRequest): Promise<Response> {
  const fn = handlers[req.action];
  if (!fn) {
    return jsonResponse(
      {
        error: `unknown action 'space.${req.action}'. Available: ${
          SPACE_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return fn(req);
}
