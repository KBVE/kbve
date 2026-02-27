import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import {
	resolvePlayer,
	loadSkinDataUrl,
	type MojangProfile,
} from '../../lib/mojang';
import { openPlayerPanel } from '../../lib/player-panel-store';
import PlayerCard from './PlayerCard';
import PlayerHoverCard from './PlayerHoverCard';
import PlayerPanel from './PlayerPanel';

interface PlayerData {
	profile: MojangProfile;
	skinDataUrl: string | null;
}

interface HoverState {
	rect: DOMRect;
	profile: MojangProfile;
	skinDataUrl: string | null;
}

const gridStyle: CSSProperties = {
	listStyle: 'none',
	padding: 0,
	margin: 0,
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))',
	gap: '0.5rem',
};

export default function PlayerGrid() {
	const [players, setPlayers] = useState<PlayerData[]>([]);
	const [hover, setHover] = useState<HoverState | null>(null);

	// On mount, read player names from Askama-rendered DOM
	useEffect(() => {
		const cards = document.querySelectorAll<HTMLElement>(
			'.player-card[data-playername]',
		);
		const names: string[] = [];
		cards.forEach((card) => {
			const name = card.dataset.playername;
			if (name) names.push(name);
		});

		if (names.length === 0) return;

		// Hide the static Askama-rendered list
		const staticList = document.querySelector('.player-list');
		if (staticList instanceof HTMLElement) {
			staticList.style.display = 'none';
		}

		// Resolve each player in parallel
		Promise.allSettled(names.map((name) => resolvePlayer(name))).then(
			async (results) => {
				const resolved: PlayerData[] = [];
				for (const result of results) {
					if (result.status === 'fulfilled' && result.value) {
						const profile = result.value;
						let skinDataUrl: string | null = null;
						if (profile.skinUrl) {
							skinDataUrl = await loadSkinDataUrl(
								profile.uuid,
								profile.skinUrl,
							);
						}
						resolved.push({ profile, skinDataUrl });
					}
				}
				setPlayers(resolved);
			},
		);
	}, []);

	const handleHoverStart = useCallback(
		(rect: DOMRect, profile: MojangProfile) => {
			const player = players.find((p) => p.profile.uuid === profile.uuid);
			setHover({
				rect,
				profile,
				skinDataUrl: player?.skinDataUrl ?? null,
			});
		},
		[players],
	);

	const handleHoverEnd = useCallback(() => {
		setHover(null);
	}, []);

	const handleClick = useCallback(
		(profile: MojangProfile) => {
			setHover(null);
			// Ensure we have the skin data url for the panel
			const player = players.find((p) => p.profile.uuid === profile.uuid);
			openPlayerPanel({
				...profile,
				skinUrl: player?.profile.skinUrl ?? profile.skinUrl,
			});
		},
		[players],
	);

	if (players.length === 0) return null;

	return (
		<>
			<div style={gridStyle} role="list">
				{players.map((p) => (
					<PlayerCard
						key={p.profile.uuid}
						profile={p.profile}
						skinDataUrl={p.skinDataUrl}
						onHoverStart={handleHoverStart}
						onHoverEnd={handleHoverEnd}
						onClick={handleClick}
					/>
				))}
			</div>

			<PlayerHoverCard
				visible={hover !== null}
				anchorRect={hover?.rect ?? null}
				name={hover?.profile.name ?? ''}
				uuid={hover?.profile.uuid ?? null}
				skinDataUrl={hover?.skinDataUrl ?? null}
			/>

			<PlayerPanel />
		</>
	);
}
