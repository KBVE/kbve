import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";
import { corsHeaders, preflight, withCors } from "../_shared/cors.ts";
import { logError } from "../_shared/logging.ts";
import { rateLimit, rateLimitKey } from "../_shared/ratelimit.ts";
import { loadEnv, validateJwtSecret } from "../_shared/env.ts";
import {
  SECRET_NAME_RE,
  MAX_SECRET_VALUE_LENGTH,
  UUID_RE,
} from "../_shared/formats.ts";
import {
  enforceBodySizeLimit,
  rejectIllegalChars,
  requireJsonContentType,
} from "../_shared/validators.ts";

// ---------------------------------------------------------------------------
// Vault Reader Edge Function — read/write Supabase Vault secrets
//
// Auth: service_role only (verified against JWT_SECRET)
//
// POST /vault-reader  { command, ... }
//   get           — fetch a decrypted secret by UUID
//   set           — create/update a secret
//   get_by_guild  — bot-facing guild token lookup
//   get_by_tag    — alias for get_by_guild, parses "service:server_id" tag
// ---------------------------------------------------------------------------

const env = loadEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
]);
const JWT_SECRET = validateJwtSecret(env.JWT_SECRET);

const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST method is allowed" }),
      { status: 405, headers: JSON_HEADERS },
    );
  }

  const ctErr = requireJsonContentType(req);
  if (ctErr) return ctErr;

  const sizeErr = enforceBodySizeLimit(req);
  if (sizeErr) return sizeErr;

  try {
    const body = await req.json();
    const { command } = body;

    if (!command) {
      return new Response(
        JSON.stringify({ error: "command is required (get or set)" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: JSON_HEADERS },
      );
    }

    const token = authHeader.replace("Bearer ", "");

    let claims: { role?: string; sub?: string };
    try {
      const key = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
      });
      claims = payload as { role?: string; sub?: string };

      if (claims.role !== "service_role") {
        return new Response(
          JSON.stringify({ error: "Access denied: Service role required" }),
          { status: 403, headers: JSON_HEADERS },
        );
      }
    } catch (jwtError) {
      logError("vault-reader", jwtError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: JSON_HEADERS },
      );
    }

    const rl = rateLimit(
      rateLimitKey("vault-reader", req, claims.sub as string | undefined),
      { limit: 60, windowMs: 60_000 },
    );
    if (rl) return rl;

    if (command === "get") {
      const { secret_id } = body;

      if (!secret_id || typeof secret_id !== "string") {
        return new Response(
          JSON.stringify({ error: "secret_id is required for get command" }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      if (!UUID_RE.test(secret_id)) {
        return new Response(
          JSON.stringify({ error: "secret_id must be a valid UUID" }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      const { data, error } = await supabase.rpc(
        "get_vault_secret_by_id",
        { secret_id: secret_id },
      );

      if (error) {
        logError("vault-reader", error);
        return new Response(
          JSON.stringify({ error: "Failed to retrieve secret" }),
          { status: 500, headers: JSON_HEADERS },
        );
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        return new Response(
          JSON.stringify({ error: "Secret not found" }),
          { status: 404, headers: JSON_HEADERS },
        );
      }

      const secret = data[0];

      return new Response(
        JSON.stringify({
          id: secret.id,
          name: secret.name,
          description: secret.description,
          decrypted_secret: secret.decrypted_secret,
          created_at: secret.created_at,
          updated_at: secret.updated_at,
        }),
        { headers: JSON_HEADERS },
      );
    }

    if (command === "set") {
      const { secret_name, secret_value, secret_description } = body;

      if (!secret_name || !secret_value) {
        return new Response(
          JSON.stringify({
            error: "secret_name and secret_value are required for set command",
          }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      if (typeof secret_name !== "string" || !SECRET_NAME_RE.test(secret_name)) {
        return new Response(
          JSON.stringify({
            error:
              "secret_name must be 1-100 chars: alphanumeric, underscore, or dash",
          }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      const illegalName = rejectIllegalChars(secret_name, "secret_name");
      if (illegalName) return illegalName;

      if (
        typeof secret_value !== "string" ||
        secret_value.length > MAX_SECRET_VALUE_LENGTH
      ) {
        return new Response(
          JSON.stringify({
            error: `secret_value must be a string of at most ${MAX_SECRET_VALUE_LENGTH} characters`,
          }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      const { data, error } = await supabase.rpc("set_vault_secret", {
        secret_name: secret_name,
        secret_value: secret_value,
        secret_description: secret_description || null,
      });

      if (error) {
        logError("vault-reader", error);
        return new Response(
          JSON.stringify({ error: "Failed to store secret" }),
          { status: 500, headers: JSON_HEADERS },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          secret_id: data,
          message: "Secret created/updated successfully",
        }),
        { headers: JSON_HEADERS },
      );
    }

    if (command === "get_by_guild") {
      const { server_id, service } = body;

      if (!server_id || !service) {
        return new Response(
          JSON.stringify({
            error:
              "server_id and service are required for get_by_guild command",
          }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      const { data, error } = await supabase.rpc("bot_get_guild_token", {
        p_server_id: server_id,
        p_service: service,
      });

      if (error) {
        logError("vault-reader", error);
        return new Response(
          JSON.stringify({ error: "Failed to retrieve guild token" }),
          { status: 500, headers: JSON_HEADERS },
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({
            error: "No active token found for this guild and service",
          }),
          { status: 404, headers: JSON_HEADERS },
        );
      }

      return new Response(
        JSON.stringify({
          id: "",
          name: `guild/${server_id}/tokens/${service}`,
          description: null,
          decrypted_secret: data,
          created_at: "",
          updated_at: "",
        }),
        { headers: JSON_HEADERS },
      );
    }

    if (command === "get_by_tag") {
      const { tag } = body;

      if (!tag || typeof tag !== "string") {
        return new Response(
          JSON.stringify({ error: "tag is required for get_by_tag command" }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      const colonIdx = tag.indexOf(":");
      if (colonIdx === -1) {
        return new Response(
          JSON.stringify({
            error: 'Invalid tag format. Expected "service_name:server_id"',
          }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      const tagService = tag.substring(0, colonIdx).replace(/_pat$/, "");
      const tagServerId = tag.substring(colonIdx + 1);

      const { data, error } = await supabase.rpc("bot_get_guild_token", {
        p_server_id: tagServerId,
        p_service: tagService,
      });

      if (error) {
        logError("vault-reader", error);
        return new Response(
          JSON.stringify({ error: "Failed to retrieve guild token" }),
          { status: 500, headers: JSON_HEADERS },
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({ error: "No active token found for tag" }),
          { status: 404, headers: JSON_HEADERS },
        );
      }

      return new Response(
        JSON.stringify({
          id: "",
          name: tag,
          description: null,
          decrypted_secret: data,
          created_at: "",
          updated_at: "",
        }),
        { headers: JSON_HEADERS },
      );
    }

    return new Response(
      JSON.stringify({
        error:
          'Invalid command. Use "get", "set", "get_by_guild", or "get_by_tag"',
      }),
      { status: 400, headers: JSON_HEADERS },
    );
  } catch (err) {
    logError("vault-reader", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
}

serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return preflight(req);
  }
  return withCors(await handle(req), req);
});
