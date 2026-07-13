export interface Binding {
	keys: string[];
	note?: string;
}

export const CLIP_CONTROLS: Record<string, Binding> = {
	Idle_Loop: { keys: [], note: 'default stance' },
	Walk_Loop: { keys: ['W', 'A', 'S', 'D'], note: 'move' },
	Jog_Fwd_Loop: { keys: ['W', 'A', 'S', 'D'], note: 'move' },
	Sprint_Loop: { keys: ['Shift'], note: 'hold to run' },
	Jump_Start: { keys: ['Space'], note: 'jump' },
	Jump_Loop: { keys: ['Space'], note: 'airborne' },
	Jump_Land: { keys: ['Space'], note: 'land' },
	Punch_Jab: { keys: ['LMB'], note: 'combo 1 (unarmed)' },
	Punch_Cross: { keys: ['LMB'], note: 'combo 2 (unarmed)' },
	Melee_Hook: { keys: ['LMB'], note: 'combo 3 (unarmed)' },
	Sword_Attack: { keys: ['LMB'], note: 'attack (armed)' },
	Sword_Block: { keys: ['RMB'], note: 'guard' },
	Idle_Shield_Loop: { keys: ['RMB'], note: 'shield guard' },
};

export function bindingOf(clip: string): Binding | null {
	return CLIP_CONTROLS[clip] ?? null;
}
