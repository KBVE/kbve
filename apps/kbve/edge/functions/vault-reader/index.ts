import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";
import { corsHeaders } from "../_shared/cors.ts";
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST method is allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
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
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Security check: Verify JWT token and role
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Get JWT secret from environment
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) {
      console.error("JWT_SECRET not found in environment");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    try {
      // Convert the secret to a proper key format
      const key = new TextEncoder().encode(jwtSecret);

      // Verify the JWT token
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
      });

      // Check if it's a service_role token
      if (payload.role !== "service_role") {
        return new Response(
          JSON.stringify({
            error: "Access denied: Service role required",
          }),
          {
            status: 403,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Handle GET command (retrieve secret)
    if (command === "get") {
      const { secret_id } = body;

      if (!secret_id || typeof secret_id !== "string") {
        return new Response(
          JSON.stringify({
            error: "secret_id is required for get command",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (!UUID_RE.test(secret_id)) {
        return new Response(
          JSON.stringify({
            error: "secret_id must be a valid UUID",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Call our RPC function to get the decrypted secret from vault
      const { data, error } = await supabase.rpc(
        "get_vault_secret_by_id",
        {
          secret_id: secret_id,
        },
      );

      if (error) {
        console.error("Error fetching secret via RPC:", error.message);
        return new Response(
          JSON.stringify({ error: "Failed to retrieve secret" }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        return new Response(
          JSON.stringify({ error: "Secret not found" }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // RPC returns an array, get the first result
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
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Handle SET command (create/update secret)
    if (command === "set") {
      const { secret_name, secret_value, secret_description } = body;

      if (!secret_name || !secret_value) {
        return new Response(
          JSON.stringify({
            error: "secret_name and secret_value are required for set command",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Validate secret_name format
      if (typeof secret_name !== "string" || !SECRET_NAME_RE.test(secret_name)) {
        return new Response(
          JSON.stringify({
            error:
              "secret_name must be 1-100 chars: alphanumeric, underscore, or dash",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const illegalName = rejectIllegalChars(secret_name, "secret_name");
      if (illegalName) return illegalName;

      // Validate secret_value length
      if (
        typeof secret_value !== "string" ||
        secret_value.length > MAX_SECRET_VALUE_LENGTH
      ) {
        return new Response(
          JSON.stringify({
            error: `secret_value must be a string of at most ${MAX_SECRET_VALUE_LENGTH} characters`,
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Call our RPC function to set the secret in vault
      const { data, error } = await supabase.rpc("set_vault_secret", {
        secret_name: secret_name,
        secret_value: secret_value,
        secret_description: secret_description || null,
      });

      if (error) {
        console.error("Error setting secret via RPC:", error.message);
        return new Response(
          JSON.stringify({ error: "Failed to store secret" }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          secret_id: data,
          message: "Secret created/updated successfully",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Handle GET_BY_GUILD command (bot-facing guild token lookup)
    if (command === "get_by_guild") {
      const { server_id, service } = body;

      if (!server_id || !service) {
        return new Response(
          JSON.stringify({
            error:
              "server_id and service are required for get_by_guild command",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const { data, error } = await supabase.rpc("bot_get_guild_token", {
        p_server_id: server_id,
        p_service: service,
      });

      if (error) {
        console.error("Error fetching guild token via RPC:", error.message);
        return new Response(
          JSON.stringify({ error: "Failed to retrieve guild token" }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({
            error: "No active token found for this guild and service",
          }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
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
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Handle GET_BY_TAG command (alias for get_by_guild, parses tag format)
    if (command === "get_by_tag") {
      const { tag } = body;

      if (!tag || typeof tag !== "string") {
        return new Response(
          JSON.stringify({
            error: "tag is required for get_by_tag command",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Parse tag format: "github_pat:1234567890" -> service=github, server_id=1234567890
      const colonIdx = tag.indexOf(":");
      if (colonIdx === -1) {
        return new Response(
          JSON.stringify({
            error: 'Invalid tag format. Expected "service_name:server_id"',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const tagService = tag.substring(0, colonIdx).replace(/_pat$/, "");
      const tagServerId = tag.substring(colonIdx + 1);

      const { data, error } = await supabase.rpc("bot_get_guild_token", {
        p_server_id: tagServerId,
        p_service: tagService,
      });

      if (error) {
        console.error("Error fetching guild token via tag RPC:", error.message);
        return new Response(
          JSON.stringify({ error: "Failed to retrieve guild token" }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({ error: "No active token found for tag" }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
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
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Invalid command
    return new Response(
      JSON.stringify({
        error:
          'Invalid command. Use "get", "set", "get_by_guild", or "get_by_tag"',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
