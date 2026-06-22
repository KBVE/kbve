import type { InputRouter } from '../input-router';
import { Action } from '../actions';

// Feeds a normalized stick vector (-1..1 each axis) into the movement actions.
// A React thumbstick or a DOM drag handler drives set()/release().
export class TouchStick {
	constructor(private router: InputRouter) {}

	set(dx: number, dy: number): void {
		this.router.setAnalog(Action.MoveRight, dx > 0 ? dx : 0);
		this.router.setAnalog(Action.MoveLeft, dx < 0 ? -dx : 0);
		this.router.setAnalog(Action.MoveDown, dy > 0 ? dy : 0);
		this.router.setAnalog(Action.MoveUp, dy < 0 ? -dy : 0);
	}

	release(): void {
		this.router.release(Action.MoveRight);
		this.router.release(Action.MoveLeft);
		this.router.release(Action.MoveDown);
		this.router.release(Action.MoveUp);
	}
}
