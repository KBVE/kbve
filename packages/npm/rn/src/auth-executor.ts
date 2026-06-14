import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthEffect, AuthEvent, EffectExecutor } from '@kbve/core';
import { mapSession } from './supabase';

WebBrowser.maybeCompleteAuthSession();

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
							options: { redirectTo, skipBrowserRedirect: true },
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
			}
		},
	};
}
