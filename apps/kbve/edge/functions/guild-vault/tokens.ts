import {
  createServiceClient,
  type GuildVaultRequest,
  invalidateOwnershipCache,
  jsonResponse,
  verifyOwnedGuildsClaim,
} from "./_shared.ts";
import { safeRpcError } from "../_shared/validators.ts";
import {
  DeleteTokenRequestSchema,
  ListTokensRequestSchema,
  PeekTokenRequestSchema,
  SetTokenRequestSchema,
  ToggleTokenRequestSchema,
} from "../_shared/agents-schema.ts";

// ---------------------------------------------------------------------------
// Guild token CRUD handlers — all use service client + Discord ownership
//
// Deliberately omits get_token — decrypted tokens are bot-only, never
// exposed through the edge function layer.
// ---------------------------------------------------------------------------

type Handler = (req: GuildVaultRequest) => Promise<Response>;

// Services whose decrypted value is non-secret config that the agents
// dashboard needs to render. Everything not on this list stays bot-only.
const PEEKABLE_SERVICES = new Set([
	"github_repos",
	"discordsh_config",
]);

const handlers: Record<string, Handler> = {
  async set_token({ userId, claims, body }) {
    const {
      server_id,
      token_name,
      service,
      token_value,
      description,
    } = body;

    const parsed = SetTokenRequestSchema.safeParse({
      server_id,
      service,
      token_name,
      token_value,
      description: description ?? undefined,
    });
    if (!parsed.success) {
      return jsonResponse(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        400,
      );
    }

    const ownerErr = verifyOwnedGuildsClaim(claims, server_id as string);
    if (ownerErr) return ownerErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.schema("discordsh").rpc("service_set_guild_token", {
      p_owner_id: userId,
      p_server_id: server_id as string,
      p_service: service as string,
      p_token_name: token_name as string,
      p_token_value: token_value as string,
      p_description: (description as string) || null,
    });

    if (error) {
      invalidateOwnershipCache(userId, server_id as string);
      return safeRpcError(error, "guild_vault_rpc");
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return jsonResponse(
        { success: false, error: "No response from database" },
        500,
      );
    }

    return jsonResponse(
      { success: row.success, token_id: row.token_id, message: row.message },
      row.success ? 200 : 400,
    );
  },

  async list_tokens({ userId, claims, body }) {
    const { server_id } = body;

    const parsed = ListTokensRequestSchema.safeParse({ server_id });
    if (!parsed.success) {
      return jsonResponse(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        400,
      );
    }

    const ownerErr = verifyOwnedGuildsClaim(claims, server_id as string);
    if (ownerErr) return ownerErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.schema("discordsh").rpc("service_list_guild_tokens", {
      p_owner_id: userId,
      p_server_id: server_id as string,
    });

    if (error) {
      invalidateOwnershipCache(userId, server_id as string);
      return safeRpcError(error, "guild_vault_rpc");
    }

    const rows = Array.isArray(data) ? data : [];
    const tokens = rows.map((t) => ({ ...t, token_id: t.id }));
    return jsonResponse({ success: true, tokens, count: tokens.length });
  },

  async delete_token({ userId, claims, body }) {
    const { server_id, token_id } = body;

    const parsed = DeleteTokenRequestSchema.safeParse({ server_id, token_id });
    if (!parsed.success) {
      return jsonResponse(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        400,
      );
    }

    const ownerErr = verifyOwnedGuildsClaim(claims, server_id as string);
    if (ownerErr) return ownerErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.schema("discordsh").rpc(
      "service_delete_guild_token",
      {
        p_owner_id: userId,
        p_server_id: server_id as string,
        p_token_id: token_id as string,
      },
    );

    if (error) {
      invalidateOwnershipCache(userId, server_id as string);
      return safeRpcError(error, "guild_vault_rpc");
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return jsonResponse(
        { success: false, error: "No response from database" },
        500,
      );
    }

    return jsonResponse(
      { success: row.success, message: row.message },
      row.success ? 200 : 400,
    );
  },

  async toggle_token({ userId, claims, body }) {
    const { server_id, token_id, is_active } = body;

    const parsed = ToggleTokenRequestSchema.safeParse({
      server_id,
      token_id,
      is_active,
    });
    if (!parsed.success) {
      return jsonResponse(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        400,
      );
    }

    const ownerErr = verifyOwnedGuildsClaim(claims, server_id as string);
    if (ownerErr) return ownerErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.schema("discordsh").rpc(
      "service_toggle_guild_token_status",
      {
        p_owner_id: userId,
        p_server_id: server_id as string,
        p_token_id: token_id as string,
        p_is_active: is_active,
      },
    );

    if (error) {
      invalidateOwnershipCache(userId, server_id as string);
      return safeRpcError(error, "guild_vault_rpc");
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return jsonResponse(
        { success: false, error: "No response from database" },
        500,
      );
    }

    return jsonResponse(
      { success: row.success, message: row.message },
      row.success ? 200 : 400,
    );
  },
	async peek_token({ userId, claims, body }) {
		const { server_id, service } = body;

		const parsed = PeekTokenRequestSchema.safeParse({ server_id, service });
		if (!parsed.success) {
			return jsonResponse(
				{ error: parsed.error.issues[0]?.message ?? "Invalid request" },
				400,
			);
		}

		if (!PEEKABLE_SERVICES.has(service as string)) {
			return jsonResponse(
				{
					error:
						`service '${service}' is not peekable. Only non-secret config rows are readable through the dashboard.`,
				},
				403,
			);
		}

		const ownerErr = verifyOwnedGuildsClaim(claims, server_id as string);
		if (ownerErr) return ownerErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc("bot_get_guild_token", {
			p_server_id: server_id as string,
			p_service: service as string,
		});

		if (error) {
			invalidateOwnershipCache(userId, server_id as string);
			return safeRpcError(error, "guild_vault_rpc");
		}

		const value = typeof data === "string" ? data : null;
		return jsonResponse({ success: true, value });
	},
};

export const TOKEN_ACTIONS = Object.keys(handlers);

export async function handleTokens(
  req: GuildVaultRequest,
): Promise<Response> {
  const handler = handlers[req.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown token action: ${req.action}. Use: ${
          TOKEN_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(req);
}
