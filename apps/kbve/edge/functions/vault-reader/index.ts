import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://deno.land/x/jose@v4.14.4/index.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
	// Handle CORS preflight requests
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	// Only allow POST requests
	if (req.method !== 'POST') {
		return new Response(
			JSON.stringify({ error: 'Only POST method is allowed' }),
			{
				status: 405,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			},
		);
	}

	try {
		const body = await req.json();
		const { command } = body;

		if (!command) {
			return new Response(
				JSON.stringify({ error: 'command is required (get or set)' }),
				{
					status: 400,
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
					},
				},
			);
		}

		// Create Supabase client with service role key
		const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		});

		// Security check: Verify JWT token and role
		const authHeader = req.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return new Response(
				JSON.stringify({ error: 'Authorization header required' }),
				{
					status: 401,
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
					},
				},
			);
		}

		const token = authHeader.replace('Bearer ', '');

		// Get JWT secret from environment
		const jwtSecret = Deno.env.get('JWT_SECRET');
		if (!jwtSecret) {
			console.error('JWT_SECRET not found in environment');
			return new Response(
				JSON.stringify({ error: 'Server configuration error' }),
				{
					status: 500,
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
					},
				},
			);
		}

		try {
			// Convert the secret to a proper key format
			const key = new TextEncoder().encode(jwtSecret);

			// Verify the JWT token
			const { payload } = await jwtVerify(token, key, {
				algorithms: ['HS256'],
			});

			// Check if it's a service_role token
			if (payload.role !== 'service_role') {
				return new Response(
					JSON.stringify({
						error: 'Access denied: Service role required',
					}),
					{
						status: 403,
						headers: {
							...corsHeaders,
							'Content-Type': 'application/json',
						},
					},
				);
			}
		} catch (jwtError) {
			console.error('JWT verification error:', jwtError);
			return new Response(
				JSON.stringify({ error: 'Invalid or expired token' }),
				{
					status: 401,
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
					},
				},
			);
		}

		// Handle GET command (retrieve secret)
		if (command === 'get') {
			const { secret_id } = body;

			if (!secret_id) {
				return new Response(
					JSON.stringify({
						error: 'secret_id is required for get command',
					}),
					{
						status: 400,
						headers: {
							...corsHeaders,
							'Content-Type': 'application/json',
						},
					},
				);
			}

			// Call our RPC function to get the decrypted secret from vault
			const { data, error } = await supabase.rpc(
				'get_vault_secret_by_id',
				{
					secret_id: secret_id,
				},
			);

			if (error) {
				console.error('Error fetching secret via RPC:', error);
				return new Response(JSON.stringify({ error: error.message }), {
					status: 500,
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
					},
				});
			}

			if (!data || !Array.isArray(data) || data.length === 0) {
				return new Response(
					JSON.stringify({ error: 'Secret not found' }),
					{
						status: 404,
						headers: {
							...corsHeaders,
							'Content-Type': 'application/json',
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
						'Content-Type': 'application/json',
					},
				},
			);
		}

		// Handle SET command (create/update secret)
		if (command === 'set') {
			const { secret_name, secret_value, secret_description } = body;

			if (!secret_name || !secret_value) {
				return new Response(
					JSON.stringify({
						error: 'secret_name and secret_value are required for set command',
					}),
					{
						status: 400,
						headers: {
							...corsHeaders,
							'Content-Type': 'application/json',
						},
					},
				);
			}

			// Call our RPC function to set the secret in vault
			const { data, error } = await supabase.rpc('set_vault_secret', {
				secret_name: secret_name,
				secret_value: secret_value,
				secret_description: secret_description || null,
			});

			if (error) {
				console.error('Error setting secret via RPC:', error);
				return new Response(JSON.stringify({ error: error.message }), {
					status: 500,
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
					},
				});
			}

			return new Response(
				JSON.stringify({
					success: true,
					secret_id: data,
					message: 'Secret created/updated successfully',
				}),
				{
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
					},
				},
			);
		}

		// Invalid command
		return new Response(
			JSON.stringify({ error: 'Invalid command. Use "get" or "set"' }),
			{
				status: 400,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			},
		);
	} catch (err) {
		console.error('Unexpected error:', err);
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			},
		);
	}
});
