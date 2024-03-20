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

	update(keys: { [key: string]: Phaser.Input.Keyboard.Key }) {
		if (!keys) return;

		const velocityX = keys.left.isDown
			? -this.speed
			: keys.right.isDown
			? this.speed
			: 0;
		const velocityZ = keys.up.isDown
			? -this.speed
			: keys.down.isDown
			? this.speed
			: 0;

		const velocityY = keys.space.isDown
			? this.speed
			: keys.shift.isDown
			? -this.speed
			: 0;

		this.physicsObject.body.setVelocity(velocityX, velocityY, velocityZ);
	}
}
