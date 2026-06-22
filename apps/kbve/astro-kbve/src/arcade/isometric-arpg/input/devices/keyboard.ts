import type Phaser from 'phaser';
import type { InputRouter } from '../input-router';
import {
	DEFAULT_KEY_BINDINGS,
	type KeyBindings,
	type KeyCode,
} from '../bindings';

type KeyboardPlugin = Phaser.Input.Keyboard.KeyboardPlugin;

export class KeyboardDevice {
	private bindings: KeyBindings;

	constructor(
		private kb: KeyboardPlugin,
		private router: InputRouter,
		bindings: KeyBindings = DEFAULT_KEY_BINDINGS,
	) {
		this.bindings = bindings;
	}

	private onDown = (ev: KeyboardEvent) => {
		const action = this.bindings[ev.code as KeyCode];
		if (action === undefined) return;
		this.router.press(action);
	};

	private onUp = (ev: KeyboardEvent) => {
		const action = this.bindings[ev.code as KeyCode];
		if (action === undefined) return;
		this.router.release(action);
	};

	attach(): void {
		this.kb.on('keydown', this.onDown);
		this.kb.on('keyup', this.onUp);
	}

	detach(): void {
		this.kb.off('keydown', this.onDown);
		this.kb.off('keyup', this.onUp);
	}

	setBindings(bindings: KeyBindings): void {
		this.bindings = bindings;
	}
}
