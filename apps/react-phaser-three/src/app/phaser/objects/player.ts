import { ExtendedObject3D, Scene3D, THREE } from '@enable3d/phaser-extension';

export default class Player extends ExtendedObject3D {
	private readonly speed = 10; // Adjust the speed as necessary
	private onGround = false;
	private isJumping = false;
	private physicsObject: ExtendedObject3D | null = null;
	private currentAnimation: string;

	constructor(
		private scene: Scene3D,
		assetUrl: string,
		scale: number = 1 / 3
	) {
		super();

		this.currentAnimation = 'Idle';

		if (typeof assetUrl !== 'string') {
			console.error(
				'Asset URL is not a string in Player constructor:',
				assetUrl
			);
			return;
		}
		this.scene.third.load
			.gltf(assetUrl)
			.then((gltf) => {
				this.physicsObject = new ExtendedObject3D();
				this.physicsObject.add(gltf.scene);
				this.physicsObject.scale.set(scale, scale, scale);

				this.physicsObject.traverse((child) => {
					if (child.isMesh) {
						child.castShadow = child.receiveShadow = true;
					}
				});

				// animations
				this.scene.third.animationMixers.add(
					this.physicsObject.anims.mixer
				);
				gltf.animations.forEach((animation) => {
					if (!this.physicsObject) return;
					this.physicsObject.anims.add(animation.name, animation);
				});
				this.physicsObject.anims.play('Idle');

				this.scene.third.add.existing(this.physicsObject);
				this.scene.third.physics.add.existing(this.physicsObject, {
					shape: 'capsule',
					ignoreScale: true,
					height: 0.8,
					radius: 0.4,
					offset: { y: -0.8 },
				});
				this.physicsObject.body.setLinearFactor(1, 1, 0);
				this.physicsObject.body.setAngularFactor(0, 0, 0);
				this.physicsObject.body.setFriction(0);

				// Add a sensor for the ground detection similar to Player
				const sensor = new ExtendedObject3D();
				sensor.position.setY(-0.9);
				this.scene.third.physics.add.existing(sensor, {
					mass: 1e-8,
					shape: 'box',
					width: 0.2,
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
			})
			.catch((error) => {
				console.error('Error loading player:', error);
			});
	}
	walkAnimation() {
		if (this.currentAnimation !== 'Walking' && this.physicsObject) {
			this.physicsObject.anims.play('Walking');
			this.currentAnimation = 'Walking';
		}
	}

	idleAnimation() {
		if (this.currentAnimation !== 'Idle' && this.physicsObject) {
			this.physicsObject.anims.play('Idle');
			this.currentAnimation = 'Idle';
		}
	}

	update(keys: { [key: string]: Phaser.Input.Keyboard.Key }) {
		if (!keys) return;

		if (!this.physicsObject) return;
		if (this.physicsObject.body) {
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

		const theta = this.physicsObject.world.theta;
		this.physicsObject.body.setAngularVelocityY(0);

		if (velocityX > 0) {
			if (theta < Math.PI / 2)
				this.physicsObject.body.setAngularVelocityY(10);
			this.walkAnimation();
		} else if (velocityX < 0) {
			if (theta > -(Math.PI / 2))
				this.physicsObject.body.setAngularVelocityY(-10);
			this.walkAnimation();
		} else {
			this.idleAnimation();
		}

		if (keys.space.isDown && onGround && !this.isJumping) {
			this.physicsObject.body.applyForceY(16);
			this.isJumping = true;
		}

		if (!keys.space.isDown && this.isJumping) {
			this.isJumping = false;
		}

		this.physicsObject.body.setVelocityX(velocityX);
	}
}
