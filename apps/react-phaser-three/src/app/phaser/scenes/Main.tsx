import { Scene3D } from '@enable3d/phaser-extension';
import { Player } from '../objects'; // Make sure this path is correct.

// Define a type for the keys that can be used in the game.
type GameKeys = 'up' | 'down' | 'left' | 'right' | 'space' | 'shift';

// Define a type for the mapping between action strings and Phaser's keyboard keys.
type KeyMappings = {
	[key in GameKeys]?: Phaser.Input.Keyboard.Key;
};

export class Main extends Scene3D {
	private isTouchDevice: boolean;
	private player: Player | null = null;
	private keys: KeyMappings = {};

	constructor() {
		super({ key: 'Main' });
		this.isTouchDevice = false;
	}

	init(): void {
		this.accessThirdDimension();
		this.isTouchDevice = this.sys.game.device.input.touch;
	}

	create(): void {
		this.third.warpSpeed(); // Ensure the environment is initialized

		if (!this.input.keyboard) return;

		this.add
			.text(10, 10, 'Click here to set keybinds', {
				color: '#00ff00',
				fontSize: '32px',
			})
			.setInteractive()
			.on('pointerdown', () => {
				this.scene.start('Keybinds');
			});

		// Define default keys in case local storage is empty or keys are not yet customized.
		const defaultKeys: Record<GameKeys, string> = {
			up: 'W',
			down: 'S',
			left: 'A',
			right: 'D',
			space: 'SPACE',
			shift: 'SHIFT',
		};

		// Attempt to retrieve custom key mappings from local storage and convert them.
		Object.keys(defaultKeys).forEach((action) => {
			const actionKey: GameKeys = action as GameKeys;
			const storedKey: string =
				localStorage.getItem(`custom${actionKey}Key`) ||
				defaultKeys[actionKey];
			if (!this.input.keyboard) return;
			this.keys[actionKey] = this.input.keyboard.addKey(storedKey);
		});

		// Create the player.
		this.player = new Player(this, 0, 0, 0, 1, 1, 1);
		this.third.add.existing(this.player);
	}

	update(): void {
		if (!this.player) return;
		this.player.update(this.keys);
	}
}
