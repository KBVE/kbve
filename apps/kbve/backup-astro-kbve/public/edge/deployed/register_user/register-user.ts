// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.22.4";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, X-Client-Info, Content-Type, Authorization, Accept, Accept-Language, X-Authorization",
  "Access-Control-Expose-Headers": "Content-Length, X-JSON"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? ""
      }
    }
  });
  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const inputSchema = z.object({
    username: z.string().regex(/^[a-zA-Z0-9_-]{3,30}$/)
  });
  try {
    const body = await req.json();
    const parsed = inputSchema.parse(body);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { id: user_id } = user;
    const { error: rpcError } = await supabaseAdmin.rpc("create_user_context_proxy", {
      user_id,
      username: parsed.username,
      bio: "",
      avatar_ulid: null,
      role: null,
      level: 1,
      credits: 0,
      khash: 0
    });
    if (rpcError) {
      console.error("[create_user_context] RPC Error", rpcError);
      return new Response(JSON.stringify({
        error: rpcError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      user_metadata: {
        username: parsed.username
      }
    });
    if (metaError) {
      console.error("[user_metadata] Failed to update:", metaError);
      return new Response(JSON.stringify({
        error: metaError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("[create_user_context] Parse/Error", err);
    return new Response(JSON.stringify({
      error: err?.message ?? "Unknown error"
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
