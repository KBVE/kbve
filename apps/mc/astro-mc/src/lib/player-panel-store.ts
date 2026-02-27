import { atom } from 'nanostores';
import type { MojangProfile } from './mojang';

interface PanelState {
	open: boolean;
	player: MojangProfile | null;
}

export const $playerPanel = atom<PanelState>({ open: false, player: null });

export function openPlayerPanel(player: MojangProfile): void {
	$playerPanel.set({ open: true, player });
}

export function closePlayerPanel(): void {
	$playerPanel.set({ open: false, player: null });
}
