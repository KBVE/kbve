import { Scene3D } from '@enable3d/phaser-extension';
import { Player } from '../objects';
import { Room, Client } from 'colyseus.js';

import { GameKeys, KeyMappings, PlayerType, EndpointSettings } from '../types';

export class Main extends Scene3D {
	private player: Player | null = null;
	private keys: KeyMappings = {};
	private otherPlayers: Map<string, Player> = new Map();
	public room: Room | null = null;
	private client: Client | null = null;
	private isTouchDevice: boolean;

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

	// Connect to the Colyseus server.
	async connectToServer() {
		// todo: change to load from env
		const vite_ws_url: EndpointSettings = {
			hostname: 'localhost',
			secure: false,
			port: 2567,
		};
		this.client = new Client(vite_ws_url);
		try {
			this.room = await this.client.joinOrCreate('my_room');

			this.room.send('getPlayers');
			this.room.onMessage('playersList', (message) => {
				console.log('Players list:', message);
				message.forEach((player: PlayerType) => {
					console.log(player);
					this.createPlayer(player.sessionId);
				});
			});

			this.room.onMessage('playerMoved', (message) => {
				if (!this.room) return;
				this.updatePlayerPosition(
					message.sessionId,
					message.x,
					message.y,
					message.z
				);
			});
			this.room.onMessage('playerJoined', (message) => {
				console.log('Player joined', message);
				this.createPlayer(message.sessionId);
			});
			this.room.onMessage('playerLeft', (message) => {
				console.log('Player left', message);
				this.removePlayer(message.sessionId);
			});
		} catch (e) {
			console.error('Failed to connect to server:', e);
		}
	}
	async initializeScene(): Promise<void> {
		const { lights } = await this.third.warpSpeed(
			'-ground',
			'-sky',
			'-orbitControls'
		);

		this.third.camera.position.set(0, 5, 20);
		this.third.camera.lookAt(0, 0, 0);

		// Load and set the sky texture
		this.third.load.texture('sky').then((sky) => {
			this.third.scene.background = sky;
		});

		// Add platforms and other static elements to match the server environment.
		// These values and items should match those initialized in your ServerScene.
		const platformMaterial = {
			phong: { transparent: true, color: 0x21572f },
		};
		// The platforms here should match those created in the server's physics simulation
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

		// Note: No physics simulation runs here; these are just visual representations.

		// Add keybinds interaction
		this.add
			.text(10, 10, 'Click here to set keybinds', {
				color: '#00ff00',
				fontSize: '32px',
			})
			.setInteractive()
			.on('pointerdown', () => {
				this.scene.start('Keybinds');
			});
	}

	private initializeKeyboard(): void {
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
	}

	async create(): Promise<void> {
		await this.connectToServer();
		this.initializeScene();
		this.initializeKeyboard();

		this.player = new Player(this);
	}

	update(): void {
		if (!this.room || !this.player) return;
		const hasMoved = this.player.checkSignificantMovement();
		if (hasMoved) {
			this.player.update(this.keys);
		}
	}

	updatePlayerPosition(sessionId: string, x: number, y: number, z: number) {
		const player = this.otherPlayers.get(sessionId) || this.player;
		if (player) {
			player.setPosition(x, y, z);
		}
	}

	createPlayer(sessionId: string) {
		if (this.otherPlayers.has(sessionId) || !this.room) return;
		if (sessionId === this.room.sessionId) return;
		const player = new Player(this);
		this.otherPlayers.set(sessionId, player);
	}

	removePlayer(sessionId: string) {
		const player = this.otherPlayers.get(sessionId);
		if (player) {
			player.destroy();
			this.otherPlayers.delete(sessionId);
		}
	}
}
