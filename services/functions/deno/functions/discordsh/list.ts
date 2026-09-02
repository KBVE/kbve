import {
  createServiceClient,
  type DiscordshRequest,
  jsonResponse,
} from "./_shared.ts";
import { safeRpcError } from "../_shared/validators.ts";
import { clampLimit, clampPage } from "../_shared/pagination.ts";
import { PAGINATION } from "../_shared/constants.ts";
import { rateLimit, rateLimitKey } from "../_shared/ratelimit.ts";

// ---------------------------------------------------------------------------
// Discordsh List Module
//
// Actions:
//   servers — Public paginated server listing (no auth required)
// ---------------------------------------------------------------------------

type Handler = (req: DiscordshRequest) => Promise<Response>;

const VALID_SORTS = new Set(["votes", "members", "newest", "bumped"]);

const handlers: Record<string, Handler> = {
  async servers({ body, req }) {
    const rl = rateLimit(rateLimitKey("discordsh.list", req), {
      limit: 60,
      windowMs: 60_000,
    });
    if (rl) return rl;

    const limit = clampLimit(body.limit, {
      def: PAGINATION.discordsh.defaultLimit,
      max: PAGINATION.discordsh.maxLimit,
    });
    const page = clampPage(body.page, PAGINATION.discordsh.maxPage);
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
    /**
     * `total` is a snapshot of the count returned alongside this page of rows.
     * Because the count and the page data are read together (not in a single
     * serializable transaction), concurrent writes can shift it, so `has_more`
     * is best-effort rather than exact.
     */
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

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
