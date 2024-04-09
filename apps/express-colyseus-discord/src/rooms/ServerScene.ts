import { Physics, ServerClock } from '@enable3d/ammo-on-nodejs';
import { ExtendedObject3D } from 'enable3d';
import _ammo from '@enable3d/ammo-on-nodejs/ammo/ammo.js';

export class ServerScene {
	physics: Physics; // Physics engine f
	playerBodies: Map<string, ExtendedObject3D>; // Map session IDs to physics bodies
	platforms: ExtendedObject3D[]; // Store the platforms
	private static instance: ServerScene;
	onPlayerPlatformStateChange: (
		sessionId: string,
		isOnPlatform: boolean,
	) => void;

	private constructor() {
		this.playerBodies = new Map();
		this.init();
		this.create();
	}

	public registerPlayerPlatformStateChangeCallback(
		callback: (sessionId: string, isOnPlatform: boolean) => void,
	) {
		this.onPlayerPlatformStateChange = callback;
	}

	public static getInstance(): ServerScene {
		if (!ServerScene.instance) {
			ServerScene.instance = new ServerScene();
		}
		return ServerScene.instance;
	}

	onUpdate(delta: number) {
		this.physics.update(delta * 1000);
		this.playerBodies.forEach((playerBody, sessionId) => {
			const player = this.getPlayer(sessionId);
			if (!player) return;

			// Check if the player is on a platform
			const playerPos = playerBody.position;
			const playerHeight = 2;

			let isOnPlatform = false;
			this.platforms.forEach((platform) => {
				// todo: check if the player is on the platform
				const platformPos = platform.position;
				const parameters = (platform.geometry as THREE.BoxGeometry)
					.parameters;

				const platformSize = {
					width: parameters.width,
					height: parameters.height,
					depth: parameters.depth,
				};
				const isAbovePlatform =
					playerPos.x >= platformPos.x - platformSize.width / 2 &&
					playerPos.x <= platformPos.x + platformSize.width / 2 &&
					playerPos.z >= platformPos.z - platformSize.depth / 2 &&
					playerPos.z <= platformPos.z + platformSize.depth / 2;

				const heightDifference =
					playerPos.y - (platformPos.y + platformSize.height / 2);
				if (
					isAbovePlatform &&
					heightDifference < playerHeight / 2 &&
					heightDifference >= 0
				) {
					isOnPlatform = true;
				}
			});

			if (isOnPlatform) {
				this.onPlayerPlatformStateChange(sessionId, true);
			}
		});
	}

	getPlayer(sessionId: string) {
		return this.playerBodies.get(sessionId);
	}

	init() {
		console.log('Initializing ServerScene with Physics');
		this.physics = new Physics();
	}

	create() {
		// Create the ground and platforms similar to those in the client scene

		// The positions, sizes, and names should match those of the client for consistency
		this.platforms = [
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
	ServerScene.getInstance();
});
