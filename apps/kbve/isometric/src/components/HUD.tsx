import { useEffect, useState } from 'react';
import { get_player_state_json } from '../../wasm-pkg/isometric_game.js';
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
		const interval = setInterval(() => {
			try {
				const json = get_player_state_json();
				if (json) setState(JSON.parse(json));
			} catch {
				// WASM not ready
			}
		}, 250);
		return () => clearInterval(interval);
	}, []);

	if (!state) return null;

	return (
		<GlassPanel className="absolute bottom-4 left-4 md:bottom-6 md:left-6 px-3 py-2 md:px-4 md:py-3">
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
			<div className="text-[7px] md:text-[9px] text-text-muted mt-1">
				Pos: {state.position.map((v) => v.toFixed(1)).join(', ')}
			</div>
		</GlassPanel>
	);
}
