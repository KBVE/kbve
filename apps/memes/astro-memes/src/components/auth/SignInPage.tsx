import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$auth,
	useAuthBridge,
	addToast,
	DiscordIcon,
	GitHubIcon,
	TwitchIcon,
} from '@kbve/astro';
import type { OAuthProvider } from '@kbve/astro';
import { authBridge, initSupa } from '../../lib/supa';

export default function SignInPage() {
	const auth = useStore($auth);
	const { signInWithOAuth, loading } = useAuthBridge(authBridge);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		initSupa().catch(() => {});
		setReady(true);
	}, []);

	const handleOAuth = async (provider: OAuthProvider) => {
		try {
			await signInWithOAuth(provider);
			addToast({
				id: `auth-ok-${Date.now()}`,
				message: 'Signed in successfully!',
				severity: 'success',
				duration: 4000,
			});
		} catch {
			// useAuthBridge tracks the error
		}
	};

	if (!ready) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div
					className="w-10 h-10 rounded-full animate-pulse"
					style={{ backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)' }}
				/>
			</div>
		);
	}

	if (auth.tone === 'auth') {
		return (
			<div className="flex items-center justify-center min-h-[60vh] px-4">
				<div
					className="w-full max-w-sm rounded-2xl p-8 text-center"
					style={{
						backgroundColor: 'var(--sl-color-bg-nav, #18181b)',
						border: '1px solid var(--sl-color-hairline, #27272a)',
					}}>
					<div
						className="w-16 h-16 rounded-full mx-auto mb-4 overflow-hidden"
						style={{
							boxShadow: '0 0 0 3px var(--sl-color-accent, #0ea5e9)',
						}}>
						{auth.avatar ? (
							<img
								src={auth.avatar}
								alt={auth.name}
								className="w-full h-full object-cover"
							/>
						) : (
							<div
								className="w-full h-full flex items-center justify-center text-2xl font-bold"
								style={{
									backgroundColor: 'var(--sl-color-accent-low, #164e63)',
									color: 'var(--sl-color-text-accent, #22d3ee)',
								}}>
								{auth.name?.charAt(0).toUpperCase() || '?'}
							</div>
						)}
					</div>
					<h2
						className="text-lg font-semibold mb-1"
						style={{ color: 'var(--sl-color-white, #e2e8f0)' }}>
						Welcome back, {auth.name}
					</h2>
					<p
						className="text-sm mb-6"
						style={{ color: 'var(--sl-color-gray-2, #a1a1aa)' }}>
						You&apos;re already signed in.
					</p>
					<div className="flex flex-col gap-2">
						<a
							href="/profile"
							className="inline-flex items-center justify-center rounded-lg text-sm font-medium px-4 py-2.5 transition-colors"
							style={{
								backgroundColor: 'var(--sl-color-accent, #0ea5e9)',
								color: '#fff',
							}}>
							Go to Profile
						</a>
						<a
							href="/feed"
							className="inline-flex items-center justify-center rounded-lg text-sm font-medium px-4 py-2.5 transition-colors"
							style={{
								backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
								color: 'var(--sl-color-white, #e2e8f0)',
							}}>
							Browse Feed
						</a>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-center justify-center min-h-[60vh] px-4">
			<div
				className="w-full max-w-sm rounded-2xl p-8"
				style={{
					backgroundColor: 'var(--sl-color-bg-nav, #18181b)',
					border: '1px solid var(--sl-color-hairline, #27272a)',
				}}>
				<div className="text-center mb-6">
					<h2
						className="text-xl font-semibold mb-1"
						style={{ color: 'var(--sl-color-white, #e2e8f0)' }}>
						Sign in to Meme.sh
					</h2>
					<p
						className="text-sm"
						style={{ color: 'var(--sl-color-gray-2, #a1a1aa)' }}>
						Choose a provider to get started
					</p>
				</div>

				{auth.error && (
					<div
						className="mb-4 text-xs rounded-lg px-3 py-2"
						style={{
							color: '#fca5a5',
							backgroundColor: 'rgba(239,68,68,0.1)',
						}}>
						{auth.error}
					</div>
				)}

				<div className="flex flex-col gap-3">
					<button
						type="button"
						onClick={() => handleOAuth('discord')}
						disabled={loading}
						className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg text-sm font-medium px-4 py-3 transition-colors disabled:opacity-60"
						style={{ backgroundColor: '#5865F2', color: '#fff' }}
						onMouseEnter={(e) => {
							e.currentTarget.style.backgroundColor = '#4752C4';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.backgroundColor = '#5865F2';
						}}>
						<DiscordIcon className="w-5 h-5" />
						Continue with Discord
					</button>

					<button
						type="button"
						onClick={() => handleOAuth('github')}
						disabled={loading}
						className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg text-sm font-medium px-4 py-3 transition-colors disabled:opacity-60"
						style={{ backgroundColor: '#24292f', color: '#fff' }}
						onMouseEnter={(e) => {
							e.currentTarget.style.backgroundColor = '#1b1f23';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.backgroundColor = '#24292f';
						}}>
						<GitHubIcon className="w-5 h-5" />
						Continue with GitHub
					</button>

					<button
						type="button"
						onClick={() => handleOAuth('twitch')}
						disabled={loading}
						className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg text-sm font-medium px-4 py-3 transition-colors disabled:opacity-60"
						style={{ backgroundColor: '#9146FF', color: '#fff' }}
						onMouseEnter={(e) => {
							e.currentTarget.style.backgroundColor = '#7B2FFF';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.backgroundColor = '#9146FF';
						}}>
						<TwitchIcon className="w-5 h-5" />
						Continue with Twitch
					</button>
				</div>

				<p
					className="mt-5 text-[11px] text-center"
					style={{ color: 'var(--sl-color-gray-3, #71717a)' }}>
					Your session syncs automatically across all tabs.
				</p>
			</div>
		</div>
	);
}
