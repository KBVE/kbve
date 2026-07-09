export type Phase =
	| 'idle'
	| 'raise'
	| 'lower'
	| 'primary'
	| 'secondary'
	| 'reload';

export type VmEvent = 'equip' | 'primary' | 'secondary' | 'reload' | 'done';

export const DURATION: Record<Phase, number> = {
	idle: 0,
	raise: 0.28,
	lower: 0.22,
	primary: 0.18,
	secondary: 0.3,
	reload: 0.9,
};

const BUSY: Phase[] = ['primary', 'secondary', 'reload'];

export function nextPhase(phase: Phase, ev: VmEvent): Phase {
	if (ev === 'equip') return 'raise';
	if (ev === 'done') return 'idle';
	if (BUSY.includes(phase)) return phase;
	if (ev === 'primary') return 'primary';
	if (ev === 'secondary') return 'secondary';
	if (ev === 'reload') return 'reload';
	return phase;
}

export interface FsmSnapshot {
	phase: Phase;
	entered: boolean;
}

export function createFsm() {
	let phase: Phase = 'raise';
	let elapsed = 0;

	return {
		get phase() {
			return phase;
		},
		fire(ev: VmEvent): boolean {
			const nx = nextPhase(phase, ev);
			if (nx === phase) return false;
			phase = nx;
			elapsed = 0;
			return true;
		},
		tick(dt: number): FsmSnapshot {
			if (phase === 'idle') return { phase, entered: false };
			elapsed += dt;
			if (elapsed >= DURATION[phase]) {
				phase = 'idle';
				elapsed = 0;
				return { phase, entered: true };
			}
			return { phase, entered: false };
		},
	};
}

export type Fsm = ReturnType<typeof createFsm>;
