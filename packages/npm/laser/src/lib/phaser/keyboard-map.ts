import Phaser from 'phaser';

export interface KeyboardMap<K extends string> {
	cursors: Phaser.Types.Input.Keyboard.CursorKeys;
	keys: Record<K, Phaser.Input.Keyboard.Key>;
}

/**
 * Bind the arrow/cursor keys plus a named set of action keys in one call.
 * `spec` maps a caller-chosen name to a Phaser.Input.Keyboard.KeyCodes value.
 * Returns null when the scene has no keyboard plugin (headless / disabled input)
 * so callers can guard instead of crashing on a missing manager.
 *
 * Keys are added with capture disabled (second arg false) so browser defaults
 * (scroll, find) keep working — matches the per-scene inline setup it replaces.
 */
export function setupKeyboardMap<K extends string>(
	scene: Phaser.Scene,
	spec: Record<K, number>,
): KeyboardMap<K> | null {
	const kb = scene.input.keyboard;
	if (!kb) return null;
	const cursors = kb.createCursorKeys();
	const keys = {} as Record<K, Phaser.Input.Keyboard.Key>;
	for (const name of Object.keys(spec) as K[]) {
		keys[name] = kb.addKey(spec[name], false);
	}
	return { cursors, keys };
}
