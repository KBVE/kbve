import { useEffect, useMemo, useState } from 'react';
import Phaser from 'phaser';
import { PhaserGame, type LaserGameConfig } from '@kbve/laser';
import { useStore } from '@nanostores/react';
import { $auth, setAuth } from '@kbve/droid';
import { getSupa, initSupa } from '@/lib/supa';
import { BlackjackScene } from './BlackjackScene';
import { BASE_HEIGHT, BASE_WIDTH, COLORS } from './config';

type UserMetadata = Record<string, unknown> | undefined;

function metadataString(
	metadata: UserMetadata,
	key: string,
): string | undefined {
	const value = metadata?.[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function usernameFromMetadata(user: any): string | undefined {
	const metadata = user?.user_metadata as UserMetadata;
	return (
		metadataString(metadata, 'user_name') ||
		metadataString(metadata, 'preferred_username') ||
		metadataString(metadata, 'username') ||
		metadataString(metadata, 'global_name') ||
		metadataString(metadata, 'name') ||
		(typeof user?.email === 'string' ? user.email.split('@')[0] : undefined)
	);
}

export default function ReactBlackjackApp() {
	const auth = useStore($auth);
	const [resolvedUsername, setResolvedUsername] = useState<
		string | undefined
	>();

	const config = useMemo<LaserGameConfig>(
		() => ({
			width: BASE_WIDTH,
			height: BASE_HEIGHT,
			scenes: [BlackjackScene],
			backgroundColor: `#${COLORS.background.toString(16).padStart(6, '0')}`,
			scale: {
				mode: Phaser.Scale.FIT,
				autoCenter: Phaser.Scale.CENTER_BOTH,
				width: BASE_WIDTH,
				height: BASE_HEIGHT,
			},
			input: {
				keyboard: {
					target: window,
					capture: [
						Phaser.Input.Keyboard.KeyCodes.H,
						Phaser.Input.Keyboard.KeyCodes.S,
						Phaser.Input.Keyboard.KeyCodes.D,
						Phaser.Input.Keyboard.KeyCodes.N,
						Phaser.Input.Keyboard.KeyCodes.ENTER,
						Phaser.Input.Keyboard.KeyCodes.UP,
						Phaser.Input.Keyboard.KeyCodes.DOWN,
					],
				},
			},
			render: {
				antialias: true,
				pixelArt: false,
			},
			fps: {
				target: 30,
				min: 15,
			},
		}),
		[],
	);

	useEffect(() => {
		let cancelled = false;

		async function hydrateBlackjackAuth() {
			try {
				await initSupa();
			} catch (error) {
				if (!cancelled) {
					console.warn(
						'[Blackjack] Optional auth init failed:',
						error,
					);
				}
			}
		}

		void hydrateBlackjackAuth();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (auth.tone !== 'auth') {
			setResolvedUsername(undefined);
			return;
		}
		if (auth.username) {
			setResolvedUsername(auth.username);
			return;
		}

		let cancelled = false;

		async function resolveUsername() {
			try {
				await initSupa();
				const session = await getSupa().getSession();
				const accessToken = session?.session?.access_token;
				const fallbackUsername = usernameFromMetadata(
					session?.session?.user,
				);

				if (!accessToken) {
					if (!cancelled) setResolvedUsername(fallbackUsername);
					return;
				}

				const response = await fetch('/api/v1/me', {
					headers: { Authorization: `Bearer ${accessToken}` },
				});

				if (!response.ok) {
					if (!cancelled) setResolvedUsername(fallbackUsername);
					return;
				}

				const profile = (await response.json()) as {
					username?: string | null;
				};
				const username = profile.username ?? fallbackUsername;

				if (!cancelled) {
					setResolvedUsername(username);
					if (username) setAuth({ username });
				}
			} catch (error) {
				console.warn(
					'[Blackjack] Optional username lookup failed:',
					error,
				);
			}
		}

		void resolveUsername();

		return () => {
			cancelled = true;
		};
	}, [auth.tone, auth.username]);

	const playerLabel =
		auth.tone === 'auth'
			? resolvedUsername
				? `Playing as @${resolvedUsername}`
				: 'Signed in'
			: 'Playing as guest';

	return (
		<div className="relative h-full w-full">
			<div
				className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-md border border-amber-200/30 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-amber-100 shadow-lg backdrop-blur-sm"
				aria-live="polite">
				<span>{playerLabel}</span>
				{auth.tone !== 'auth' && (
					<a
						href="/auth/login/"
						className="pointer-events-auto ml-2 text-amber-300 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-100">
						Sign in
					</a>
				)}
			</div>
			<PhaserGame
				config={config}
				style={{ width: '100%', height: '100%' }}
			/>
		</div>
	);
}
