import { createServiceClient, jsonResponse } from "../_shared/supabase.ts";
import {
  TOKEN_NAME_RE,
  SERVICE_RE,
  UUID_RE,
  MIN_TOKEN_VALUE_LENGTH,
  MAX_TOKEN_VALUE_LENGTH,
} from "../_shared/formats.ts";
import { rejectIllegalChars, safeRpcError } from "../_shared/validators.ts";
import type { VaultRequest } from "./index.ts";

// ---------------------------------------------------------------------------
// Token CRUD handlers — all use service client to call service_* RPCs
// ---------------------------------------------------------------------------

type Handler = (req: VaultRequest) => Promise<Response>;

function validateTokenId(token_id: unknown): Response | null {
  if (!token_id || typeof token_id !== "string") {
    return jsonResponse({ error: "token_id (UUID) is required" }, 400);
  }
  if (!UUID_RE.test(token_id)) {
    return jsonResponse({ error: "token_id must be a valid UUID" }, 400);
  }
  return null;
}

const handlers: Record<string, Handler> = {
  async set_token({ userId, body }) {
    const { token_name, service, token_value, description } = body;

    if (!token_name || typeof token_name !== "string") {
      return jsonResponse(
        {
          error: "token_name is required (3-64 chars, a-z0-9_-)",
        },
        400,
      );
    }
    if (!TOKEN_NAME_RE.test(token_name)) {
      return jsonResponse(
        { error: "token_name must be 3-64 lowercase chars: a-z, 0-9, _, -" },
        400,
      );
    }

    if (!service || typeof service !== "string") {
      return jsonResponse(
        {
          error: "service is required (2-32 chars, lowercase a-z0-9_)",
        },
        400,
      );
    }
    if (!SERVICE_RE.test(service)) {
      return jsonResponse(
        { error: "service must be 2-32 lowercase chars: a-z, 0-9, _" },
        400,
      );
    }
    const illegalService = rejectIllegalChars(service, "service");
    if (illegalService) return illegalService;

    if (!token_value || typeof token_value !== "string") {
      return jsonResponse({ error: "token_value is required" }, 400);
    }
    if (
      token_value.length < MIN_TOKEN_VALUE_LENGTH ||
      token_value.length > MAX_TOKEN_VALUE_LENGTH
    ) {
      return jsonResponse(
        {
          error: `token_value must be ${MIN_TOKEN_VALUE_LENGTH}-${MAX_TOKEN_VALUE_LENGTH} characters`,
        },
        400,
      );
    }

    if (description !== undefined && description !== null) {
      if (typeof description !== "string" || description.length > 500) {
        return jsonResponse(
          { error: "description must be a string of at most 500 characters" },
          400,
        );
      }
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_set_api_token", {
      p_user_id: userId,
      p_token_name: token_name as string,
      p_service: service as string,
      p_token_value: token_value as string,
      p_description: (description as string) || null,
    });

    if (error) {
      return safeRpcError(error, "service_set_api_token");
    }

    return jsonResponse({ success: true, token_id: data });
  },

  async get_token({ userId, body }) {
    const { token_id } = body;
    const idErr = validateTokenId(token_id);
    if (idErr) return idErr;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_get_api_token", {
      p_user_id: userId,
      p_token_id: token_id as string,
    });

    if (error) {
      return safeRpcError(error, "service_get_api_token");
    }

    return jsonResponse({ success: true, token_value: data });
  },

  async list_tokens({ userId }) {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("service_list_api_tokens", {
      p_user_id: userId,
    });

    if (error) {
      return safeRpcError(error, "service_list_api_tokens");
    }

    const tokens = Array.isArray(data) ? data : [];
    return jsonResponse({ success: true, tokens, count: tokens.length });
  },

  async delete_token({ userId, body }) {
    const { token_id } = body;
    const idErr = validateTokenId(token_id);
    if (idErr) return idErr;

    const supabase = createServiceClient();
    const { error } = await supabase.rpc("service_delete_api_token", {
      p_user_id: userId,
      p_token_id: token_id as string,
    });

    if (error) {
      return safeRpcError(error, "service_delete_api_token");
    }

    return jsonResponse({ success: true });
  },

  async toggle_token({ userId, body }) {
    const { token_id, is_active } = body;
    const idErr = validateTokenId(token_id);
    if (idErr) return idErr;

    if (typeof is_active !== "boolean") {
      return jsonResponse(
        { error: "is_active (boolean) is required" },
        400,
      );
    }

    const supabase = createServiceClient();
    const { error } = await supabase.rpc(
      "service_toggle_api_token_status",
      {
        p_user_id: userId,
        p_token_id: token_id as string,
        p_is_active: is_active as boolean,
      },
    );

    if (error) {
      return safeRpcError(error, "service_toggle_api_token_status");
    }

    return jsonResponse({ success: true });
  },
};

export const TOKEN_ACTIONS = Object.keys(handlers);

export async function handleTokens(vaultReq: VaultRequest): Promise<Response> {
  const handler = handlers[vaultReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown token action: ${vaultReq.action}. Use: ${
          TOKEN_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(vaultReq);
}
