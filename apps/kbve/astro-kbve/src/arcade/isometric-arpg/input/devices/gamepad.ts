import type { InputRouter } from '../input-router';
import { Action } from '../actions';
import { DEFAULT_GAMEPAD_BINDINGS, type GamepadBindings } from '../bindings';

export class GamepadDevice {
	private bindings: GamepadBindings;

	constructor(
		private router: InputRouter,
		bindings: GamepadBindings = DEFAULT_GAMEPAD_BINDINGS,
	) {
		this.bindings = bindings;
	}

	// Gamepads must be polled; call once per frame.
	poll(): void {
		const pads = navigator.getGamepads?.();
		if (!pads) return;
		const gp = pads.find((p): p is Gamepad => p != null);
		if (!gp) return;

		const binds = this.bindings.buttons;
		for (let i = 0; i < binds.length; i++) {
			const action = binds[i];
			if (action === undefined) continue;
			const button = gp.buttons[i];
			if (!button) continue;
			if (button.pressed) this.router.press(action);
			else this.router.release(action);
		}

		const lx = this.deadzone(gp.axes[this.bindings.axes.moveX] ?? 0);
		const ly = this.deadzone(gp.axes[this.bindings.axes.moveY] ?? 0);
		this.router.setAnalog(Action.MoveRight, lx > 0 ? lx : 0);
		this.router.setAnalog(Action.MoveLeft, lx < 0 ? -lx : 0);
		this.router.setAnalog(Action.MoveDown, ly > 0 ? ly : 0);
		this.router.setAnalog(Action.MoveUp, ly < 0 ? -ly : 0);
	}

	private deadzone(v: number): number {
		return Math.abs(v) < this.bindings.deadzone ? 0 : v;
	}

	setBindings(bindings: GamepadBindings): void {
		this.bindings = bindings;
	}
}
