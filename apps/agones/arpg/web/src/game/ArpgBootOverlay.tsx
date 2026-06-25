import { useEffect, useState } from 'react';
import { onBoot, type BootStatus } from './systems/hud';
import { arpgAsset } from './config';

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

const LOGO = arpgAsset('/assets/brand/logo/rentearthlogo.png');

export default function ArpgBootOverlay() {
	const [boot, setBoot] = useState<BootStatus>({
		phase: 'connecting',
		message: 'Preparing your session',
	});

	useEffect(() => onBoot(setBoot), []);

	if (boot.phase === 'ready') return null;

	const isError = boot.phase === 'error';
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
					animation: isError
						? undefined
						: 'arpg-boot-pulse 2.2s ease-in-out infinite',
				}}
				onError={(e) => {
					(e.currentTarget as HTMLImageElement).style.display =
						'none';
				}}
			/>

			{!isError && (
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
						color: isError ? '#f87171' : '#fcd34d',
					}}>
					{boot.message}
					{assetPct != null ? ` ${assetPct}%` : ''}
				</p>
				<p style={{ margin: 0, fontSize: '12px', color: '#9fb3d8' }}>
					{boot.detail ?? SUBTITLE[boot.phase]}
				</p>
			</div>

			{!isError && (
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

			{!isError && (
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
		</div>
	);
}
