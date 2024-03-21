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
		this.accessThirdDimension({ gravity: { x: 0, y: -20, z: 0 } });
		this.isTouchDevice = this.sys.game.device.input.touch;
	}

	preload(): void {
		this.third.load.preload('sky', '/assets/img/sky.png');
		this.third.load.preload('robot', '/assets/glb/robot.glb');
	}

	async create() {
		const { lights } = await this.third.warpSpeed(
			'-ground',
			'-sky',
			'-orbitControls'
		);

		this.third.camera.position.set(0, 5, 20);
		this.third.camera.lookAt(0, 0, 0);

		this.third.physics.debug.enable(); // Uncomment to enable physics debugging.

		this.third.load
			.texture('sky')
			.then((sky) => (this.third.scene.background = sky));

		// add platforms
		const platformMaterial = {
			phong: { transparent: true, color: 0x21572f },
		};
		const platforms = [
			this.third.physics.add.box(
				{
					name: 'platform-ground',
					y: -2,
					width: 30,
					depth: 5,
					height: 2,
					mass: 0,
				},
				platformMaterial
			),
			this.third.physics.add.box(
				{
					name: 'platform-right1',
					x: 7,
					y: 4,
					width: 15,
					depth: 5,
					mass: 0,
				},
				platformMaterial
			),
			this.third.physics.add.box(
				{
					name: 'platform-left',
					x: -10,
					y: 7,
					width: 10,
					depth: 5,
					mass: 0,
				},
				platformMaterial
			),
			this.third.physics.add.box(
				{
					name: 'platform-right2',
					x: 10,
					y: 10,
					width: 10,
					depth: 5,
					mass: 0,
				},
				platformMaterial
			),
		];
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

		this.player = new Player(this, 1 / 3);
		this.third.add.existing(this.player);
	}

	update(): void {
		if (!this.player) return;
		this.player.update(this.keys);
	}
}
