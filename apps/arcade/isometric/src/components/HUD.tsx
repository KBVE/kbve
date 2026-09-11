import { useEffect, useState } from 'react';
import { get_player_state_json } from '../../wasm-pkg/isometric_game.js';
import { GlassPanel } from '../ui/shared/GlassPanel';

interface PlayerState {
	health: number;
	max_health: number;
	mana: number;
	max_mana: number;
	energy: number;
	max_energy: number;
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
		<GlassPanel className="absolute top-12 right-4 md:top-14 md:right-6 px-3 py-1.5 md:px-4 md:py-2 pointer-events-none">
			<div className="text-[7px] md:text-[9px] text-text-muted">
				Pos: {state.position.map((v) => v.toFixed(1)).join(', ')}
			</div>
		</GlassPanel>
	);
}
