import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface PlayerState {
	health: number;
	max_health: number;
	mana: number;
	max_mana: number;
	position: [number, number, number];
	inventory_slots: number;
}

function Bar({
	value,
	max,
	color,
	label,
}: {
	value: number;
	max: number;
	color: string;
	label: string;
}) {
	const pct = max > 0 ? (value / max) * 100 : 0;
	return (
		<div style={{ marginBottom: 6 }}>
			<div
				style={{
					fontSize: 11,
					marginBottom: 2,
					textShadow: '0 1px 2px rgba(0,0,0,0.8)',
				}}>
				{label}: {value}/{max}
			</div>
			<div
				style={{
					width: 180,
					height: 14,
					background: 'rgba(0,0,0,0.6)',
					borderRadius: 3,
					overflow: 'hidden',
					border: '1px solid rgba(255,255,255,0.15)',
				}}>
				<div
					style={{
						width: `${pct}%`,
						height: '100%',
						background: color,
						transition: 'width 0.3s ease',
					}}
				/>
			</div>
		</div>
	);
}

export function HUD() {
	const [state, setState] = useState<PlayerState | null>(null);

	useEffect(() => {
		const interval = setInterval(async () => {
			try {
				const s = await invoke<PlayerState>('get_player_state');
				setState(s);
			} catch {
				// IPC not ready
			}
		}, 250);
		return () => clearInterval(interval);
	}, []);

	if (!state) return null;

	return (
		<div
			style={{
				position: 'absolute',
				bottom: 16,
				left: 16,
				padding: '12px 16px',
				background: 'rgba(0,0,0,0.55)',
				borderRadius: 8,
				backdropFilter: 'blur(4px)',
				pointerEvents: 'auto',
			}}>
			<Bar
				label="HP"
				value={state.health}
				max={state.max_health}
				color="#c0392b"
			/>
			<Bar
				label="MP"
				value={state.mana}
				max={state.max_mana}
				color="#2980b9"
			/>
			<div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
				Pos: {state.position.map((v) => v.toFixed(1)).join(', ')}
			</div>
		</div>
	);
}
