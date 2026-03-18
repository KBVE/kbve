import {
  createServiceClient,
  type DiscordshRequest,
  jsonResponse,
} from "./_shared.ts";
import { safeRpcError } from "../_shared/validators.ts";

// ---------------------------------------------------------------------------
// Discordsh List Module
//
// Actions:
//   servers — Public paginated server listing (no auth required)
// ---------------------------------------------------------------------------

type Handler = (req: DiscordshRequest) => Promise<Response>;

const VALID_SORTS = new Set(["votes", "members", "newest", "bumped"]);

const handlers: Record<string, Handler> = {
  async servers({ body }) {
    const limit = Math.min(Math.max(Number(body.limit) || 24, 1), 50);
    const page = Math.max(Number(body.page) || 1, 1);
    const sort = typeof body.sort === "string" && VALID_SORTS.has(body.sort)
      ? body.sort
      : "votes";
    const category = typeof body.category === "number" &&
        body.category >= 1 &&
        body.category <= 12
      ? body.category
      : null;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("proxy_list_servers", {
      p_limit: limit,
      p_page: page,
      p_sort: sort,
      p_category: category,
    });

    if (error) {
      return safeRpcError(error, "proxy_list_servers");
    }

    const rows = Array.isArray(data) ? data : [];
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

    // Strip total_count from each row before sending to client
    const servers = rows.map(
      ({ total_count: _, ...rest }: Record<string, unknown>) => rest,
    );

    return jsonResponse({
      success: true,
      servers,
      total,
      page,
      has_more: page * limit < total,
    });
  },
};

export const LIST_ACTIONS = Object.keys(handlers);

export async function handleList(req: DiscordshRequest): Promise<Response> {
  const handler = handlers[req.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown list action: ${req.action}. Use: ${
          LIST_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(req);
}
