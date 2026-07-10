import { describe, it, expect, vi } from 'vitest';
import { setupKeyboardMap } from './keyboard-map';

vi.mock('phaser', () => ({ default: {} }));

function makeScene(hasKeyboard = true) {
	const cursors = { up: {}, down: {}, left: {}, right: {} };
	const createCursorKeys = vi.fn().mockReturnValue(cursors);
	const addKey = vi
		.fn()
		.mockImplementation((code: number) => ({ code }));
	return {
		scene: {
			input: {
				keyboard: hasKeyboard ? { createCursorKeys, addKey } : null,
			},
		} as never,
		createCursorKeys,
		addKey,
		cursors,
	};
}

describe('setupKeyboardMap', () => {
	it('returns null with no keyboard plugin', () => {
		const { scene } = makeScene(false);
		expect(setupKeyboardMap(scene, { fire: 70 })).toBeNull();
	});

	it('binds cursors and each named action key with capture disabled', () => {
		const { scene, addKey, cursors } = makeScene();
		const map = setupKeyboardMap(scene, {
			attack: 32,
			shoot: 70,
			interact: 69,
		});
		expect(map).not.toBeNull();
		expect(map!.cursors).toBe(cursors);
		expect(addKey).toHaveBeenCalledWith(32, false);
		expect(addKey).toHaveBeenCalledWith(70, false);
		expect(addKey).toHaveBeenCalledWith(69, false);
		expect(map!.keys.attack).toEqual({ code: 32 });
		expect(map!.keys.shoot).toEqual({ code: 70 });
		expect(map!.keys.interact).toEqual({ code: 69 });
	});
});
