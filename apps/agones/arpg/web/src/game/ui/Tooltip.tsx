import { useEffect, useState, type ReactElement } from 'react';
import { onTooltip, type TooltipState } from '../systems/hud';
import { PixelPanel } from '../PixelPanel';

const ACCENT = '#fcd34d';
const TEXT = '#e6ebf5';
const MUTED = '#9fb3d8';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';

/** Global HUD tooltip floated near the pointer, clamped into the viewport. */
export function Tooltip(): ReactElement | null {
	const [tip, setTip] = useState<TooltipState | null>(null);
	useEffect(() => onTooltip(setTip), []);
	if (!tip) return null;
	const left = Math.min(tip.x + 14, window.innerWidth - 150);
	const top = Math.min(tip.y + 14, window.innerHeight - 90);
	return (
		<div
			style={{
				position: 'fixed',
				left,
				top,
				zIndex: 40,
				pointerEvents: 'none',
			}}>
			<PixelPanel
				variant="slate"
				scale={2}
				style={{ padding: '6px 9px' }}>
				<div
					style={{
						fontSize: 11,
						fontWeight: 700,
						color: ACCENT,
						textShadow: TEXT_SHADOW,
						marginBottom: 3,
						whiteSpace: 'nowrap',
					}}>
					{tip.title}
				</div>
				{tip.lines.map((l, i) => (
					<div
						key={i}
						style={{
							fontSize: 10,
							color: i === 0 ? TEXT : MUTED,
							textShadow: TEXT_SHADOW,
							whiteSpace: 'nowrap',
						}}>
						{l}
					</div>
				))}
			</PixelPanel>
		</div>
	);
}
