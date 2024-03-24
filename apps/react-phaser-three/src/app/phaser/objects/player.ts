import { ExtendedObject3D, THREE } from '@enable3d/phaser-extension';
import { Main } from '../scenes';

export default class Player {
	private readonly speed = 10; // Adjust the speed as necessary
	private onGround = false;
	private isJumping = false;
	private physicsObjects: ExtendedObject3D | null = null;
	private currentAnimation: string;
	private group: THREE.Group | null = null;
	private scene: Main;

	constructor(scene: Main, scale: number = 1 / 3) {
		this.currentAnimation = 'Idle';

		this.scene = scene;
		this.group = new THREE.Group();

		this.initializePlayerComponents(scale);
	}

	private async initializePlayerComponents(scale: number = 1 / 3) {
		// Example of creating two parts, a body and a head, and adding them to the group
		const body = await this.createPlayerComponent(
			'body',
			{ height: 1.2, radius: 0.5 },
			{ x: 0, y: 0, z: 0 },
			scale
		);

		// Add components to the group
		if (!this.group) return;

		this.group.add(body);

		// Add the group to the scene
		this.scene.third.add.existing(this.group);

		// Finally, add the group itself to the scene for rendering (does not add physics)
		this.scene.third.scene.add(this.group);
	}

	private async createPlayerComponent(
		name: string,
		physicsOptions: { height?: number; radius?: number },
		position: { x: number; y: number; z: number },
		scale: number = 1 / 3
	): Promise<ExtendedObject3D> {
		// Create a new ExtendedObject3D instance for the component
		const component = new ExtendedObject3D();

		try {
			const gltf = await this.scene.third.load.gltf('robot'); // Ensure the GLTF model is loaded before proceeding
			component.name = name;
			component.add(gltf.scene);
			component.scale.set(scale, scale, scale); // Apply the scale parameter
			component.position.set(position.x, position.y, position.z);

			this.physicsObjects = component;

			component.traverse((child) => {
				if (child.isMesh) {
					child.castShadow = true;
					child.receiveShadow = true;
				}
			});

			// Set up animations if available
			if (gltf.animations.length) {
				this.scene.third.animationMixers.add(component.anims.mixer);
				gltf.animations.forEach((animation) => {
					component.anims.add(animation.name, animation);
				});
				component.anims.play('Idle'); // Assuming 'Idle' is a valid animation name
			}

			// Add ground detection sensor, if needed
			const sensor = new ExtendedObject3D();
			sensor.position.setY(-0.9); // Adjust based on your model's geometry
			this.scene.third.physics.add.existing(sensor, {
				mass: 1e-8, // Very light to not affect physics simulation
				shape: 'box',
				height: 0.2, // Adjust based on your needs
			});
			sensor.body.setCollisionFlags(4); // Make it a ghost object that detects collisions without reacting physically
			this.scene.third.physics.add.constraints.lock(
				component.body,
				sensor.body
			);

			sensor.body.on.collision((otherObject, event) => {
				// Example collision detection logic
				if (/platform/.test(otherObject.name)) {
					this.onGround = event !== 'end';
				}
			});
		} catch (error) {
			console.error('Error loading player component:', error);
		}

		return component;
	}

	walkAnimation() {
		if (this.currentAnimation !== 'Walking' && this.physicsObjects) {
			this.physicsObjects.anims.play('Walking');
			this.currentAnimation = 'Walking';
		}
	}

	idleAnimation() {
		if (this.currentAnimation !== 'Idle' && this.physicsObjects) {
			this.physicsObjects.anims.play('Idle');
			this.currentAnimation = 'Idle';
		}
	}

	update(keys: { [key: string]: Phaser.Input.Keyboard.Key }) {
		if (!keys) return;

		const actions = [];
		for (const key in keys) {
			if (keys[key].isDown) {
				actions.push(key);
			}
		}

		actions.forEach((action) => {
			if (this.scene.room) {
				this.scene.room.send('playerAction', action);
			}
		});
	}

	setPosition(x: number, y: number, z: number) {
		if (this.physicsObjects) {
			this.physicsObjects.position.set(x, y, z);
		}
	}

	checkSignificantMovement(): boolean {
		return true;
	}

	destroy() {
		if (this.physicsObjects) {
			this.scene.third.scene.remove(this.physicsObjects);
			this.scene.third.physics.destroy(this.physicsObjects);
			if (this.physicsObjects.anims && this.physicsObjects.anims.mixer) {
				this.physicsObjects.anims.mixer.stopAllAction();
				this.physicsObjects.anims.mixer.uncacheRoot(
					this.physicsObjects
				);
			}
			this.physicsObjects.traverse((child) => {
				if (child.isMesh) {
					if (child.geometry) {
						child.geometry.dispose();
					}
					if (child.material) {
						if (Array.isArray(child.material)) {
							child.material.forEach((material) =>
								material.dispose()
							);
						} else {
							child.material.dispose();
						}
					}
				}
			});
			this.physicsObjects = null;
		}
	}

	getPhysicsObject(): ExtendedObject3D | null {
		return this.physicsObjects;
	}
}
