import { ExtendedObject3D, Scene3D, THREE } from '@enable3d/phaser-extension';

export default class Player extends ExtendedObject3D {
	private readonly speed = 10;
	private physicsObject: ExtendedObject3D;
	private onGround = false;
	private isJumping = false;

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

		this.physicsObject.body.setFriction(0);
		this.physicsObject.body.setAngularFactor(0, 0, 0);
		this.physicsObject.body.setLinearFactor(1, 1, 0);

		this.add(this.physicsObject);

		// Add a sensor to detect the ground.

		const sensor = new ExtendedObject3D();
		sensor.position.setY(-0.9);

		this.scene.third.physics.add.existing(sensor, {
			mass: 1e-8,
			shape: 'box',
			height: 0.2,
			depth: 0.2,
		});
		sensor.body.setCollisionFlags(4);

		this.scene.third.physics.add.constraints.lock(
			this.physicsObject.body,
			sensor.body
		);

		sensor.body.on.collision((otherObject, event) => {
			if (/platform/.test(otherObject.name)) {
				if (event !== 'end') this.onGround = true;
				else this.onGround = false;
			}
		});
	}

	update(keys: { [key: string]: Phaser.Input.Keyboard.Key }) {
		if (!keys) return;

		if (this.physicsObject.body && this.physicsObject) {
			this.scene.third.camera.position
				.copy(this.physicsObject.position)
				.add(new THREE.Vector3(0, 5, 16));
		}
		const onGround = this.onGround;

		const velocityX = keys.left.isDown
			? -this.speed
			: keys.right.isDown
			? this.speed
			: 0;
		// const velocityZ = keys.up.isDown
		// 	? -this.speed
		// 	: keys.down.isDown
		// 	? this.speed
		// 	: 0;

		if (keys.space.isDown && onGround && !this.isJumping) {
			this.physicsObject.body.applyForceY(16);
			this.isJumping = true;
		}

		if (!keys.space.isDown && this.isJumping) {
			this.isJumping = false;
		}

		this.physicsObject.body.setVelocityX(velocityX);
		// this.physicsObject.body.setVelocityZ(velocityZ);
	}
}
