import { useCallback, useEffect, useState } from 'react';
import { onBoot, type BootStatus } from './systems/hud';
import { arpgAsset } from './config';
import { authBridge } from '../lib/auth';
import ArpgChuckAd from './ArpgChuckAd';

// If no boot event arrives for this long while still loading, assume the connect
// silently wedged (server sim dead, JWT stuck, etc.) and surface an actionable
// stall instead of spinning forever.
const STALL_MS = 12000;

// Full-cover loading overlay shown while the scene preloads art, connects, and
// streams the first map window — so the player gets staged feedback instead of a
// blank canvas between Discord approve and being in-world. The scene emits the
// phases (assets%/connecting/entering); the `ready` phase tears this down.
const SUBTITLE: Record<BootStatus['phase'], string> = {
	assets: 'Fetching textures and sprites.',
	connecting: 'Opening a socket to the game server.',
	entering: 'Loading the map and your character.',
	ready: '',
	error: 'Something went wrong — try reloading.',
};

// Ordered boot steps for the little progress tracker, so the player can see how
// far through the cold-start they are rather than a single opaque spinner.
const STEPS: { phase: BootStatus['phase']; label: string }[] = [
	{ phase: 'assets', label: 'Assets' },
	{ phase: 'connecting', label: 'Connect' },
	{ phase: 'entering', label: 'World' },
];

const LOGO = arpgAsset('/assets/brand/logo/rentearthlogo.webp');

export default function ArpgBootOverlay() {
	const [boot, setBoot] = useState<BootStatus>({
		phase: 'connecting',
		message: 'Preparing your session',
	});

	const [stalled, setStalled] = useState(false);

	useEffect(() => onBoot(setBoot), []);

	// Watchdog: every boot event resets a timer; STALL_MS of silence while still
	// loading flips us to an actionable stall (so a wedged connect doesn't loop).
	useEffect(() => {
		if (boot.phase === 'ready' || boot.phase === 'error') {
			setStalled(false);
			return;
		}
		setStalled(false);
		const t = window.setTimeout(() => setStalled(true), STALL_MS);
		return () => window.clearTimeout(t);
	}, [boot]);

	const retry = useCallback(() => window.location.reload(), []);
	const signOut = useCallback(async () => {
		try {
			await authBridge.signOut();
		} catch {
			/* fall through to reload — clears the in-page session either way */
		}
		try {
			for (const k of Object.keys(localStorage))
				if (k.startsWith('sb-')) localStorage.removeItem(k);
		} catch {
			/* private mode */
		}
		window.location.reload();
	}, []);

	if (boot.phase === 'ready') return null;

	const isError = boot.phase === 'error';
	// Either a hard error or a silent stall — both get the same actionable UI.
	const actionable = isError || stalled;
	// The bar fills during assets (real %), then sits full for the later phases so
	// it never visually "rewinds" between stages.
	const stepIdx = STEPS.findIndex((s) => s.phase === boot.phase);
	const assetPct =
		boot.phase === 'assets' && boot.progress != null
			? Math.round(boot.progress * 100)
			: null;
	const barPct = boot.phase === 'assets' ? (assetPct ?? 0) : 100;

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: '18px',
				background:
					'radial-gradient(120% 90% at 50% 30%, rgba(20,26,40,0.96), rgba(6,7,11,0.97))',
				zIndex: 30,
				fontFamily: 'monospace',
				color: '#e6ebf5',
			}}>
			<style>
				{'@keyframes arpg-boot-spin{to{transform:rotate(360deg)}}' +
					'@keyframes arpg-boot-pulse{0%,100%{opacity:0.55}50%{opacity:1}}' +
					'@keyframes arpg-boot-stripe{to{background-position:28px 0}}'}
			</style>

			<img
				src={LOGO}
				alt="Rent Earth"
				width={132}
				style={{
					imageRendering: 'auto',
					filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.55))',
					animation: actionable
						? undefined
						: 'arpg-boot-pulse 2.2s ease-in-out infinite',
				}}
				onError={(e) => {
					(e.currentTarget as HTMLImageElement).style.display =
						'none';
				}}
			/>

			{!actionable && (
				<span
					style={{
						width: '30px',
						height: '30px',
						borderRadius: '50%',
						border: '3px solid #2a3550',
						borderTopColor: '#6ea8ff',
						animation: 'arpg-boot-spin 0.8s linear infinite',
					}}
					aria-hidden="true"
				/>
			)}

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: '6px',
				}}>
				<p
					style={{
						margin: 0,
						fontSize: '15px',
						fontWeight: 700,
						color: actionable ? '#f87171' : '#fcd34d',
					}}>
					{isError
						? boot.message
						: stalled
							? 'This is taking longer than it should'
							: boot.message}
					{assetPct != null ? ` ${assetPct}%` : ''}
				</p>
				<p style={{ margin: 0, fontSize: '12px', color: '#9fb3d8' }}>
					{isError
						? (boot.detail ?? SUBTITLE.error)
						: stalled
							? 'The server may be down or your session may be stale. Retry, or sign out and back in.'
							: (boot.detail ?? SUBTITLE[boot.phase])}
				</p>
			</div>

			{actionable && (
				<div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
					<button
						type="button"
						onClick={retry}
						style={{
							padding: '9px 18px',
							fontSize: '13px',
							fontWeight: 700,
							fontFamily: 'monospace',
							borderRadius: '6px',
							border: 'none',
							cursor: 'pointer',
							background: '#6ea8ff',
							color: '#0b0e16',
						}}>
						Retry
					</button>
					<button
						type="button"
						onClick={signOut}
						style={{
							padding: '9px 18px',
							fontSize: '13px',
							fontWeight: 700,
							fontFamily: 'monospace',
							borderRadius: '6px',
							border: '1px solid #3c465c',
							cursor: 'pointer',
							background: 'transparent',
							color: '#e6ebf5',
						}}>
						Sign out
					</button>
				</div>
			)}

			{!actionable && (
				<div
					style={{
						width: '260px',
						height: '8px',
						borderRadius: '4px',
						background: '#161b29',
						border: '1px solid rgba(120,138,170,0.25)',
						overflow: 'hidden',
					}}>
					<div
						style={{
							width: `${barPct}%`,
							height: '100%',
							background:
								'repeating-linear-gradient(115deg,#6ea8ff 0 12px,#7fb4ff 12px 16px)',
							backgroundSize: '28px 100%',
							animation: 'arpg-boot-stripe 0.7s linear infinite',
							transition: 'width 0.2s linear',
						}}
					/>
				</div>
			)}

			{!actionable && (
				<div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
					{STEPS.map((s, i) => {
						const active = s.phase === boot.phase;
						const done = stepIdx > i;
						return (
							<div
								key={s.phase}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: '5px',
									fontSize: '10px',
									letterSpacing: 1,
									color: active
										? '#fcd34d'
										: done
											? '#6ea8ff'
											: '#55617d',
								}}>
								<span
									style={{
										width: '7px',
										height: '7px',
										borderRadius: '50%',
										background: active
											? '#fcd34d'
											: done
												? '#6ea8ff'
												: '#323b54',
									}}
								/>
								{s.label.toUpperCase()}
							</div>
						);
					})}
				</div>
			)}

			{!actionable && <ArpgChuckAd />}
		</div>
	);
}
