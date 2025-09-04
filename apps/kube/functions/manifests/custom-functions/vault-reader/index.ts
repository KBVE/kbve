import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    const { secret_id } = await req.json()
    
    if (!secret_id) {
      return new Response(
        JSON.stringify({ error: 'secret_id is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { 
        autoRefreshToken: false,
        persistSession: false 
      }
    })

    // Call our RPC function to get the decrypted secret from vault
    const { data, error } = await supabase.rpc('get_vault_secret_by_id', {
      secret_id: secret_id
    })

    if (error) {
      console.error('Error fetching secret via RPC:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Secret not found' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // RPC returns an array, get the first result
    const secret = data[0]

    return new Response(
      JSON.stringify({
        id: secret.id,
        name: secret.name,
        description: secret.description,
        decrypted_secret: secret.decrypted_secret,
        created_at: secret.created_at,
        updated_at: secret.updated_at
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})