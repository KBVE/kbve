import { useEffect, useState } from 'react';
import { onBoot, type BootStatus } from './systems/hud';

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

export default function ArpgBootOverlay() {
	const [boot, setBoot] = useState<BootStatus>({
		phase: 'connecting',
		message: 'Preparing your session',
	});

	useEffect(() => onBoot(setBoot), []);

	if (boot.phase === 'ready') return null;

	const pct =
		boot.phase === 'assets' && boot.progress != null
			? Math.round(boot.progress * 100)
			: null;
	const isError = boot.phase === 'error';

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: '16px',
				background: 'rgba(8,9,14,0.92)',
				zIndex: 30,
				fontFamily: 'monospace',
				color: '#e6ebf5',
			}}>
			<style>
				{'@keyframes arpg-boot-spin{to{transform:rotate(360deg)}}'}
			</style>
			{!isError && (
				<span
					style={{
						width: '34px',
						height: '34px',
						borderRadius: '50%',
						border: '3px solid #2a3550',
						borderTopColor: '#6ea8ff',
						animation: 'arpg-boot-spin 0.8s linear infinite',
					}}
					aria-hidden="true"
				/>
			)}
			<p
				style={{
					margin: 0,
					fontSize: '15px',
					color: isError ? '#f87171' : '#fcd34d',
				}}>
				{boot.message}
				{pct != null ? ` ${pct}%` : ''}
			</p>
			<p style={{ margin: 0, fontSize: '13px', color: '#9fb3d8' }}>
				{SUBTITLE[boot.phase]}
			</p>
			{pct != null && (
				<div
					style={{
						width: '220px',
						height: '6px',
						borderRadius: '3px',
						background: '#1b2030',
						overflow: 'hidden',
					}}>
					<div
						style={{
							width: `${pct}%`,
							height: '100%',
							background: '#6ea8ff',
							transition: 'width 0.15s linear',
						}}
					/>
				</div>
			)}
		</div>
	);
}
