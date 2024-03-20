import { ExtendedObject3D, Scene3D } from '@enable3d/phaser-extension';

export default class Player extends ExtendedObject3D {
	private readonly speed = 10;
	private physicsObject: ExtendedObject3D;

	constructor(
		private scene: Scene3D,
		x: number,
		y: number,
		z: number,
		width = 1,
		height = 1,
		depth = 1
	) {
		super();
		this.physicsObject = this.scene.third.physics.add.box(
			{ x, y, z, width, height, depth },
			{ phong: { color: 'blue' } }
		);
		this.add(this.physicsObject);
	}

	update(cursors: Phaser.Types.Input.Keyboard.CursorKeys) {
		if (!cursors) return;

		const velocityX = cursors.left.isDown
			? -this.speed
			: cursors.right.isDown
			? this.speed
			: 0;
		const velocityZ = cursors.up.isDown
			? -this.speed
			: cursors.down.isDown
			? this.speed
			: 0;

		this.physicsObject.body.setVelocity(velocityX, 0, velocityZ);
	}
}
