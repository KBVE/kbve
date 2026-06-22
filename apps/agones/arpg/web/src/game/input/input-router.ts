import { ACTION_COUNT, type ActionId } from './actions';
import type { InputContextStack } from './input-context';

export class InputRouter {
	private down = new Uint8Array(ACTION_COUNT);
	private pressed = new Uint8Array(ACTION_COUNT);
	private released = new Uint8Array(ACTION_COUNT);
	private analog = new Float32Array(ACTION_COUNT);
	private context: InputContextStack | null;

	constructor(context: InputContextStack | null = null) {
		this.context = context;
	}

	setContext(context: InputContextStack | null): void {
		this.context = context;
	}

	getContext(): InputContextStack | null {
		return this.context;
	}

	press(action: ActionId, strength = 1): void {
		if (this.down[action] === 0) this.pressed[action] = 1;
		this.down[action] = 1;
		this.analog[action] = strength;
	}

	release(action: ActionId): void {
		if (this.down[action] === 1) this.released[action] = 1;
		this.down[action] = 0;
		this.analog[action] = 0;
	}

	setAnalog(action: ActionId, value: number): void {
		const v = value < 0 ? 0 : value > 1 ? 1 : value;
		const active = v > 0 ? 1 : 0;
		if (active === 1 && this.down[action] === 0) this.pressed[action] = 1;
		if (active === 0 && this.down[action] === 1) this.released[action] = 1;
		this.down[action] = active;
		this.analog[action] = v;
	}

	private gated(action: ActionId): boolean {
		return this.context ? !this.context.allows(action) : false;
	}

	isDown(action: ActionId): boolean {
		return this.down[action] === 1 && !this.gated(action);
	}

	justPressed(action: ActionId): boolean {
		return this.pressed[action] === 1 && !this.gated(action);
	}

	justReleased(action: ActionId): boolean {
		return this.released[action] === 1 && !this.gated(action);
	}

	value(action: ActionId): number {
		return this.gated(action) ? 0 : this.analog[action];
	}

	axis(negative: ActionId, positive: ActionId): number {
		return this.value(positive) - this.value(negative);
	}

	// Edge read that clears itself, so a single press fires exactly once even if
	// multiple systems poll it in the same frame.
	consume(action: ActionId): boolean {
		if (!this.justPressed(action)) return false;
		this.pressed[action] = 0;
		return true;
	}

	// Call once after all consumers have polled for the frame.
	endFrame(): void {
		this.pressed.fill(0);
		this.released.fill(0);
	}

	reset(): void {
		this.down.fill(0);
		this.pressed.fill(0);
		this.released.fill(0);
		this.analog.fill(0);
	}
}

let instance: InputRouter | null = null;

export function getInputRouter(): InputRouter {
	if (!instance) instance = new InputRouter();
	return instance;
}

export function setInputRouter(router: InputRouter): void {
	instance = router;
}
