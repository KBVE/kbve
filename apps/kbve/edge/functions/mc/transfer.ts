import {
  createServiceClient,
  jsonResponse,
  type McRequest,
  requireServiceRole,
  validateMcUuid,
} from "./_shared.ts";
import { safeRpcError } from "../_shared/validators.ts";
import { PAGINATION } from "../_shared/constants.ts";
import { clampLimit, clampOffset } from "../_shared/pagination.ts";

// ---------------------------------------------------------------------------
// MC Transfer Module
//
// Actions:
//   record   — MC server records a batch of item transfer events
//   history  — MC server queries transfer history for a player
// ---------------------------------------------------------------------------

type Handler = (mcReq: McRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  async record({ claims, body }) {
    const denied = requireServiceRole(claims);
    if (denied) return denied;

    const { batch } = body;
    if (!batch || !Array.isArray(batch)) {
      return jsonResponse({ error: "batch must be a JSON array" }, 400);
    }

    if (batch.length === 0) {
      return jsonResponse(
        { success: false, error: "batch must not be empty", recorded_count: 0 },
        400,
      );
    }

    if (batch.length > PAGINATION.transfer.maxBatch) {
      return jsonResponse(
        {
          error:
            `Batch size exceeds limit of ${PAGINATION.transfer.maxBatch} transfers`,
        },
        400,
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.schema("mc").rpc("service_record_transfers", {
      p_batch: batch,
    });

    if (error) {
      return safeRpcError(error, "service_record_transfers");
    }

    return jsonResponse({ success: true, recorded_count: data });
  },

  async history({ claims, body }) {
    const denied = requireServiceRole(claims);
    if (denied) return denied;

    const { player_uuid } = body;
    const uuidErr = validateMcUuid(player_uuid, "player_uuid");
    if (uuidErr) return uuidErr;

    const limit = clampLimit(body.limit, {
      def: PAGINATION.transfer.defaultLimit,
      max: PAGINATION.transfer.maxLimit,
    });
    const offset = clampOffset(body.offset);

    const supabase = createServiceClient();
    const { data, error } = await supabase.schema("mc").rpc(
      "service_get_transfer_history",
      {
        p_player_uuid: player_uuid as string,
        p_server_id: (body.server_id as string) || null,
        p_since: (body.since as string) || null,
        p_limit: limit,
        p_offset: offset,
      },
    );

    if (error) {
      return safeRpcError(error, "service_get_transfer_history");
    }

    const transfers = Array.isArray(data) ? data : [];
    return jsonResponse({ transfers, total_count: transfers.length });
  },
};

export const TRANSFER_ACTIONS = Object.keys(handlers);

export async function handleTransfer(mcReq: McRequest): Promise<Response> {
  const handler = handlers[mcReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown transfer action: ${mcReq.action}. Use: ${
          TRANSFER_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(mcReq);
}
