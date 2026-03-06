import {
  createServiceClient,
  type GuildVaultRequest,
  invalidateOwnershipCache,
  jsonResponse,
  validateDescription,
  validateProviderToken,
  validateService,
  validateSnowflake,
  validateTokenName,
  validateTokenValue,
  validateUuid,
  verifyGuildOwnership,
} from "./_shared.ts";

// ---------------------------------------------------------------------------
// Guild token CRUD handlers — all use service client + Discord ownership
//
// Deliberately omits get_token — decrypted tokens are bot-only, never
// exposed through the edge function layer.
// ---------------------------------------------------------------------------

type Handler = (req: GuildVaultRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  async set_token({ userId, body }) {
    const {
      server_id,
      token_name,
      service,
      token_value,
      description,
      provider_token,
    } = body;

    const ptErr = validateProviderToken(provider_token);
    if (ptErr) return ptErr;

    const sidErr = validateSnowflake(server_id, "server_id");
    if (sidErr) return sidErr;

    const tnErr = validateTokenName(token_name);
    if (tnErr) return tnErr;

    const svcErr = validateService(service);
    if (svcErr) return svcErr;

    const tvErr = validateTokenValue(token_value);
    if (tvErr) return tvErr;

    const descErr = validateDescription(description);
    if (descErr) return descErr;

    // Discord API ownership verification (cached 5 min)
    const ownerErr = await verifyGuildOwnership(
      userId,
      server_id as string,
      provider_token as string,
    );
    if (ownerErr) return ownerErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_set_guild_token", {
      p_owner_id: userId,
      p_server_id: server_id as string,
      p_service: service as string,
      p_token_name: token_name as string,
      p_token_value: token_value as string,
      p_description: (description as string) || null,
    });

    if (error) {
      invalidateOwnershipCache(userId, server_id as string);
      return jsonResponse({ error: error.message }, 400);
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

  async list_tokens({ userId, body }) {
    const { server_id, provider_token } = body;

    const ptErr = validateProviderToken(provider_token);
    if (ptErr) return ptErr;

    const sidErr = validateSnowflake(server_id, "server_id");
    if (sidErr) return sidErr;

    const ownerErr = await verifyGuildOwnership(
      userId,
      server_id as string,
      provider_token as string,
    );
    if (ownerErr) return ownerErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_list_guild_tokens", {
      p_owner_id: userId,
      p_server_id: server_id as string,
    });

    if (error) {
      invalidateOwnershipCache(userId, server_id as string);
      return jsonResponse({ error: error.message }, 400);
    }

    const tokens = Array.isArray(data) ? data : [];
    return jsonResponse({ success: true, tokens, count: tokens.length });
  },

  async delete_token({ userId, body }) {
    const { server_id, token_id, provider_token } = body;

    const ptErr = validateProviderToken(provider_token);
    if (ptErr) return ptErr;

    const sidErr = validateSnowflake(server_id, "server_id");
    if (sidErr) return sidErr;

    const tidErr = validateUuid(token_id, "token_id");
    if (tidErr) return tidErr;

    const ownerErr = await verifyGuildOwnership(
      userId,
      server_id as string,
      provider_token as string,
    );
    if (ownerErr) return ownerErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc(
      "service_delete_guild_token",
      {
        p_owner_id: userId,
        p_server_id: server_id as string,
        p_token_id: token_id as string,
      },
    );

    if (error) {
      invalidateOwnershipCache(userId, server_id as string);
      return jsonResponse({ error: error.message }, 400);
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

  async toggle_token({ userId, body }) {
    const { server_id, token_id, is_active, provider_token } = body;

    const ptErr = validateProviderToken(provider_token);
    if (ptErr) return ptErr;

    const sidErr = validateSnowflake(server_id, "server_id");
    if (sidErr) return sidErr;

    const tidErr = validateUuid(token_id, "token_id");
    if (tidErr) return tidErr;

    if (typeof is_active !== "boolean") {
      return jsonResponse(
        { error: "is_active (boolean) is required" },
        400,
      );
    }

    const ownerErr = await verifyGuildOwnership(
      userId,
      server_id as string,
      provider_token as string,
    );
    if (ownerErr) return ownerErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc(
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
      return jsonResponse({ error: error.message }, 400);
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
