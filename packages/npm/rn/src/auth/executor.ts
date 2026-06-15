import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import type { SupabaseClient } from '@supabase/supabase-js';
import { request } from '@kbve/core';
import type {
	AuthEffect,
	AuthEvent,
	EffectExecutor,
	OAuthProvider,
} from '@kbve/core';
import { KBVE_API_URL } from '../config';
import { mapSession } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const PROVIDER_SCOPES: Record<OAuthProvider, string> = {
	discord: 'identify email',
	github: 'read:user user:email',
	twitch: 'user:read:email',
};

export function createSupabaseAuthExecutor(
	client: SupabaseClient,
): EffectExecutor<AuthEffect, AuthEvent> {
	const redirectTo = makeRedirectUri({
		scheme: 'kbve',
		path: 'auth/callback',
	});
	return {
		execute(effect, dispatch) {
			switch (effect.type) {
				case 'supabase.restore':
					void client.auth
						.getSession()
						.then(({ data }) =>
							dispatch({
								type: 'restored',
								session: mapSession(data.session),
							}),
						)
						.catch(() =>
							dispatch({ type: 'restored', session: null }),
						);
					break;
				case 'supabase.sign_in_password':
					void client.auth
						.signInWithPassword({
							email: effect.email,
							password: effect.password,
							options: { captchaToken: effect.captchaToken },
						})
						.then(({ error }) => {
							if (error)
								dispatch({
									type: 'auth_error',
									message: error.message,
								});
						});
					break;
				case 'supabase.sign_up':
					void client.auth
						.signUp({
							email: effect.email,
							password: effect.password,
							options: { captchaToken: effect.captchaToken },
						})
						.then(({ error }) => {
							if (error)
								dispatch({
									type: 'auth_error',
									message: error.message,
								});
						});
					break;
				case 'supabase.sign_in_oauth':
					void client.auth
						.signInWithOAuth({
							provider: effect.provider,
							options: {
								redirectTo,
								skipBrowserRedirect: true,
								scopes: PROVIDER_SCOPES[effect.provider],
							},
						})
						.then(async ({ data, error }) => {
							if (error || !data?.url) {
								dispatch({
									type: 'auth_error',
									message: error?.message ?? 'oauth failed',
								});
								return;
							}
							const result =
								await WebBrowser.openAuthSessionAsync(
									data.url,
									redirectTo,
								);
							if (result.type !== 'success') {
								dispatch({
									type: 'auth_error',
									message: 'oauth cancelled',
								});
								return;
							}
							const code = Linking.parse(result.url)
								.queryParams?.['code'];
							if (typeof code === 'string') {
								const { error: exchangeError } =
									await client.auth.exchangeCodeForSession(
										code,
									);
								if (exchangeError) {
									dispatch({
										type: 'auth_error',
										message: exchangeError.message,
									});
								}
							}
						});
					break;
				case 'supabase.sign_out':
					void client.auth.signOut().then(({ error }) => {
						if (error)
							dispatch({
								type: 'auth_error',
								message: error.message,
							});
					});
					break;
				case 'api.set_username':
					void (async () => {
						const { data } = await client.auth.getSession();
						const token = data.session?.access_token;
						if (!token) {
							dispatch({
								type: 'auth_error',
								message: 'Not signed in',
							});
							return;
						}
						const result = await request<{ username: string }>(
							`${KBVE_API_URL}/api/v1/profile/username`,
							{
								method: 'POST',
								headers: { Authorization: `Bearer ${token}` },
								body: { username: effect.username },
								timeoutMs: 10000,
							},
						);
						if (!result.ok) {
							dispatch({
								type: 'auth_error',
								message: result.error ?? 'Username unavailable',
							});
							return;
						}
						const { data: refreshed } =
							await client.auth.refreshSession();
						dispatch({
							type: 'session_changed',
							session: mapSession(refreshed.session),
						});
					})();
					break;
			}
		},
	};
}
