import type Phaser from 'phaser';
import type { InputRouter } from '../input-router';
import {
	DEFAULT_KEY_BINDINGS,
	type KeyBindings,
	type KeyCode,
} from '../bindings';

type KeyboardPlugin = Phaser.Input.Keyboard.KeyboardPlugin;

/** True when a text input/textarea (chat) has the keyboard, so game keybinds and
 * the raw scene handlers should stand down and let the field type. */
export function isTextInputFocused(): boolean {
	const el = document.activeElement;
	return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

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
		// While a text field (chat) owns the keyboard, the device stays out of the
		// way — no action presses, no preventDefault — so typing works and "/" /
		// space / arrows reach the input instead of the game.
		if (isTextInputFocused()) return;
		const action = this.bindings[ev.code as KeyCode];
		if (action === undefined) return;
		ev.preventDefault();
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
