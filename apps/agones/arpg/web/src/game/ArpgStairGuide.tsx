import { useEffect, useState } from 'react';
import { onGuide, type GuideView } from './systems/hud';

// On-screen objective arrow pointing to the down-stairs. The seed places the
// descent deterministically (often off the spawn screen); this guides the player
// to it without touching the seed/server parity. Hidden underground or once the
// player reaches the stair. `deg` is screen-space (0=N, CW) — CSS rotate matches.
export default function ArpgStairGuide() {
	const [guide, setGuide] = useState<GuideView | null>(null);

	useEffect(() => onGuide(setGuide), []);

	if (!guide) return null;

	return (
		<div
			style={{
				position: 'absolute',
				top: '12px',
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				alignItems: 'center',
				gap: '8px',
				padding: '5px 12px',
				borderRadius: '999px',
				background: 'rgba(8,9,14,0.7)',
				border: '1px solid #3c465c',
				color: '#fcd34d',
				fontFamily: 'monospace',
				fontSize: '12px',
				zIndex: 34,
				pointerEvents: 'none',
				whiteSpace: 'nowrap',
			}}>
			<span
				style={{
					display: 'inline-block',
					transform: `rotate(${guide.deg}deg)`,
					fontSize: '15px',
					lineHeight: 1,
				}}
				aria-hidden="true">
				↑
			</span>
			<span>Dungeon · {Math.round(guide.dist)} tiles</span>
		</div>
	);
}
