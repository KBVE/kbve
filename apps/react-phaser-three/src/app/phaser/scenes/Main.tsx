import { Scene3D, ExtendedObject3D } from '@enable3d/phaser-extension';

export class Main extends Scene3D {
	private isTouchDevice: boolean;
	private player: ExtendedObject3D | null;
	private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null;

	constructor() {
		super({ key: 'Main' });
		this.isTouchDevice = false;
		this.cursors = null; // Initialized as null, will be set in 'create'
		this.player = null; // Initialized as null, will be set in 'create'
	}

	init() {
		this.accessThirdDimension();
		this.isTouchDevice = this.sys.game.device.input.touch;
	}

	create() {
		this.third.warpSpeed('ground', 'sky', 'light'); // Initialize basic environment

		// Create the player as a box
		const box = this.third.physics.add.box({
			x: 0,
			y: 1,
			z: 0,
			width: 1,
			height: 2,
			depth: 1,
		});
		if (box) {
			this.player = box;
		}

		if (this.input && this.input.keyboard) {
			this.cursors = this.input.keyboard.createCursorKeys();
		}
	}

	update() {
		const speed = 2; // Adjust for desired speed, note this is now a velocity

		if (!this.cursors || !this.player) return; // Check if cursors and player are initialized

		// Reset velocity
		this.player.body.setVelocity(0, 0, 0);

		// Movement controls based on cursor key input
		if (this.cursors.left?.isDown) {
			this.player.body.setVelocityX(-speed); // Move left
		} else if (this.cursors.right?.isDown) {
			this.player.body.setVelocityX(speed); // Move right
		}

		if (this.cursors.up?.isDown) {
			this.player.body.setVelocityZ(-speed); // Move forward
		} else if (this.cursors.down?.isDown) {
			this.player.body.setVelocityZ(speed); // Move backward
		}
	}
}
