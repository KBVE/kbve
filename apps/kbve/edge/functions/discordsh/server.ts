import {
  createUserClient,
  type DiscordshRequest,
  jsonResponse,
  requireUserToken,
  verifyCaptcha,
} from "./_shared.ts";
import { SubmitServerRequestSchema } from "./validate.ts";
import { safeRpcError } from "../_shared/validators.ts";

// ---------------------------------------------------------------------------
// Discordsh Server Module
//
// Actions:
//   submit — Authenticated user submits a server for review (hCaptcha required)
// ---------------------------------------------------------------------------

type Handler = (req: DiscordshRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  async submit({ claims, token, body }) {
    const denied = requireUserToken(claims);
    if (denied) return denied;

    // --- Zod validation (mirrors client-side SubmitServerRequestSchema) ---
    const parsed = SubmitServerRequestSchema.omit({
      member_count: true,
    }).safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return jsonResponse(
        {
          success: false,
          error: firstError
            ? `${firstError.path.join(".")}: ${firstError.message}`
            : "Validation failed",
        },
        400,
      );
    }

    const { server_id, name, summary, invite_code, description, icon_url, banner_url, categories, tags } = parsed.data;

    // --- hCaptcha verification ---
    const captchaErr = await verifyCaptcha(body.captcha_token);
    if (captchaErr) return captchaErr;

    // --- Build RPC args ---
    const rpcArgs: Record<string, unknown> = {
      p_server_id: server_id,
      p_name: name,
      p_summary: summary,
      p_invite_code: invite_code,
    };

    if (description) rpcArgs.p_description = description;
    if (icon_url) rpcArgs.p_icon_url = icon_url;
    if (banner_url) rpcArgs.p_banner_url = banner_url;
    if (categories && categories.length > 0) rpcArgs.p_categories = categories;
    if (tags && tags.length > 0) rpcArgs.p_tags = tags;

    const supabase = createUserClient(token);
    const { data, error } = await supabase.rpc(
      "proxy_submit_server",
      rpcArgs,
    );

    if (error) {
      return safeRpcError(error, "proxy_submit_server");
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return jsonResponse(
        { success: false, error: "No response from database" },
        500,
      );
    }

    return jsonResponse(
      {
        success: row.success,
        server_id: row.server_id,
        message: row.message,
      },
      row.success ? 200 : 400,
    );
  },
};

export const SERVER_ACTIONS = Object.keys(handlers);

export async function handleServer(req: DiscordshRequest): Promise<Response> {
  const handler = handlers[req.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown server action: ${req.action}. Use: ${
          SERVER_ACTIONS.join(", ")
        }`,
      },
      400,
    );
  }
  return handler(req);
}
