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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Query vault.decrypted_secrets directly (Edge Functions can access vault schema)
    const { data, error } = await supabase
      .from('decrypted_secrets')
      .select('*')
      .eq('id', secret_id)
      .single()

    if (error) {
      console.error('Error fetching secret:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'Secret not found' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        id: data.id,
        name: data.name,
        description: data.description,
        decrypted_secret: data.decrypted_secret,
        created_at: data.created_at,
        updated_at: data.updated_at
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