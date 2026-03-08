import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GlassPanel } from '../ui/shared/GlassPanel';
import { ProgressBar } from '../ui/shared/ProgressBar';

interface PlayerState {
	health: number;
	max_health: number;
	mana: number;
	max_mana: number;
	position: [number, number, number];
	inventory_slots: number;
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
		<GlassPanel className="absolute bottom-4 left-4 px-4 py-3">
			<ProgressBar
				label="HP"
				value={state.health}
				max={state.max_health}
				color="bg-hp"
			/>
			<ProgressBar
				label="MP"
				value={state.mana}
				max={state.max_mana}
				color="bg-mp"
			/>
			<div className="text-[10px] opacity-60 mt-1">
				Pos: {state.position.map((v) => v.toFixed(1)).join(', ')}
			</div>
		</GlassPanel>
	);
}
