import { Scene3D } from '@enable3d/phaser-extension';
import { Player } from '../objects'; // Ensure the path matches where you save your Player class

export class Main extends Scene3D {
	private isTouchDevice: boolean;
	private player: Player | null = null; // Set to null initially
	private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

	constructor() {
		super({ key: 'Main' });
		this.isTouchDevice = false;
	}

	init() {
		this.accessThirdDimension();
		this.isTouchDevice = this.sys.game.device.input.touch;
	}

	create() {
		this.third.warpSpeed(); // Ensure the environment is initialized
		if (this.input && this.input.keyboard) {
			this.cursors = this.input.keyboard.createCursorKeys();
		}

		// Create the player here, ensuring 'this.third' is initialized
		this.player = new Player(this, 0, 0, 0, 1, 1, 1);
		this.third.add.existing(this.player);
	}

	update() {
		if (!this.cursors || !this.player) return;
		this.player.update(this.cursors);
	}
}
