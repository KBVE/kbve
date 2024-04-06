import { Physics, ServerClock } from '@enable3d/ammo-on-nodejs';
import { ExtendedObject3D } from 'enable3d';
import _ammo from '@enable3d/ammo-on-nodejs/ammo/ammo.js';

export class ServerScene {
	physics: Physics;
	playerBodies: Map<string, ExtendedObject3D>; // Map session IDs to physics bodies
	onUpdate: (delta: number) => void; // Update hook for external calls

	constructor() {
		this.playerBodies = new Map();
		this.init();
		this.create();
		this.onUpdate = (delta: number) => {
			if (!delta) {
                console.warn('No delta provided for update');
            }
            return;
		};
	}

	init() {
		console.log('Initializing ServerScene with Physics');
		this.physics = new Physics();
	}

	create() {
		// Create the ground and platforms similar to those in the client scene

		// The positions, sizes, and names should match those of the client for consistency
		const platforms = [
			this.physics.add.box({
				name: 'platform-ground',
				y: -3,
				width: 30,
				depth: 5,
				height: 2,
				mass: 0,
			}),
			this.physics.add.box({
				name: 'platform-right1',
				x: 7,
				y: 3,
				width: 15,
				depth: 5,
				mass: 0,
			}),
			this.physics.add.box({
				name: 'platform-left',
				x: -10,
				y: 6,
				width: 10,
				depth: 5,
				mass: 0,
			}),
			this.physics.add.box({
				name: 'platform-right2',
				x: 10,
				y: 9,
				width: 10,
				depth: 5,
				mass: 0,
			}),
		];

        if (!platforms) {
            console.warn('No platforms created');
        }

		// Initialize update loop
		const clock = new ServerClock();
		clock.onTick((delta) => {
			this.update(delta);
			this.onUpdate(delta);
		});
	}

	update(delta: number) {
		this.physics.update(delta * 1000); // Update the physics simulation
		// Here you can handle other update logic
	}

	addPlayer(
		sessionId: string,
		startPosition: { x: number; y: number; z: number },
	) {
		const playerBody = this.physics.add.box({
			name: `player-${sessionId}`,
			x: startPosition.x,
			y: startPosition.y,
			z: startPosition.z,
			width: 1,
			height: 2,
			depth: 1,
			mass: 1,
		});

		this.playerBodies.set(sessionId, playerBody);
	}

	removePlayer(sessionId: string) {
		const playerBody = this.playerBodies.get(sessionId);
		if (playerBody) {
			this.physics.destroy(playerBody);
			this.playerBodies.delete(sessionId);
		}
	}

	getPlayerPosition(
		sessionId: string,
	): { x: number; y: number; z: number } | undefined {
		const playerBody = this.playerBodies.get(sessionId);
		if (playerBody) {
			return {
				x: playerBody.position.x,
				y: playerBody.position.y,
				z: playerBody.position.z,
			};
		}
		return undefined;
	}

	movePlayer(sessionId: string, force: { x: number; y: number; z: number }) {
		const playerBody = this.playerBodies.get(sessionId);
		if (playerBody) {
			playerBody.body.applyForce(force.x, force.y, force.z);
		}
	}
}

// Initialize Ammo and start the scene
_ammo().then((ammo: typeof Ammo) => {
	globalThis.Ammo = ammo;
	new ServerScene(); // Start the server scene after Ammo is ready
});
