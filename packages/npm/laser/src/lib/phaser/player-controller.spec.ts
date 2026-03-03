import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlayerController } from './player-controller';
import { laserEvents } from '../core/events';
import type { Quadtree } from '../spatial/quadtree';

vi.mock('phaser', () => {
	const KeyCodes = { W: 87, A: 65, S: 83, D: 68 };
	return {
		default: {
			Input: { Keyboard: { KeyCodes } },
		},
		Scene: class Scene {},
		Input: { Keyboard: { KeyCodes } },
	};
});

function createMockScene() {
	const fKey = { isDown: false };
	return {
		input: {
			keyboard: {
				createCursorKeys: () => ({
					up: { isDown: false },
					down: { isDown: false },
					left: { isDown: false },
					right: { isDown: false },
				}),
				addKey: vi.fn().mockReturnValue(fKey),
			},
		},
		add: {
			text: vi.fn().mockReturnValue({
				setDepth: vi.fn().mockReturnThis(),
				setPadding: vi.fn().mockReturnThis(),
				setVisible: vi.fn().mockReturnThis(),
				setPosition: vi.fn().mockReturnThis(),
			}),
		},
		_fKey: fKey,
	};
}

function createMockGridEngine() {
	return {
		getPosition: vi.fn().mockReturnValue({ x: 5, y: 5 }),
		move: vi.fn(),
	};
}

function createMockQuadtree(queryResult: any[] = []) {
	return {
		query: vi.fn().mockReturnValue(queryResult),
		insert: vi.fn(),
		queryRange: vi.fn(),
	} as unknown as Quadtree;
}

describe('PlayerController', () => {
	let scene: ReturnType<typeof createMockScene>;
	let gridEngine: ReturnType<typeof createMockGridEngine>;
	let quadtree: Quadtree;
	let controller: PlayerController;

	beforeEach(() => {
		scene = createMockScene();
		gridEngine = createMockGridEngine();
		quadtree = createMockQuadtree();
		controller = new PlayerController(scene as any, gridEngine, quadtree);
		vi.clearAllMocks();
	});

	it('should return player position', () => {
		gridEngine.getPosition.mockReturnValue({ x: 3, y: 7 });
		const pos = controller.getPlayerPosition();
		expect(pos).toEqual({ x: 3, y: 7 });
		expect(gridEngine.getPosition).toHaveBeenCalledWith('player');
	});

	it('should use custom playerId', () => {
		const custom = new PlayerController(
			scene as any,
			gridEngine,
			quadtree,
			{
				playerId: 'hero',
			},
		);
		gridEngine.getPosition.mockReturnValue({ x: 1, y: 1 });
		custom.getPlayerPosition();
		expect(gridEngine.getPosition).toHaveBeenCalledWith('hero');
	});

	it('should call handleMovement without errors when no keys pressed', () => {
		expect(() => controller.handleMovement()).not.toThrow();
	});

	it('should emit player:interact and call range actions on F key press', () => {
		const action = vi.fn();
		const ranges = [
			{
				name: 'test',
				bounds: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
				action,
			},
		];
		quadtree = createMockQuadtree(ranges);
		controller = new PlayerController(scene as any, gridEngine, quadtree);

		const emitSpy = vi.spyOn(laserEvents, 'emit');

		scene._fKey.isDown = true;
		scene.input.keyboard.addKey.mockReturnValue(scene._fKey);

		controller.handleMovement();

		expect(action).toHaveBeenCalled();
		expect(emitSpy).toHaveBeenCalledWith('player:interact', {
			position: { x: 5, y: 5 },
			ranges,
		});

		emitSpy.mockRestore();
	});

	it('should show tooltip when near interactive objects', () => {
		const ranges = [
			{
				name: 'test',
				bounds: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
				action: vi.fn(),
			},
		];
		quadtree = createMockQuadtree(ranges);
		const tooltipMock = {
			setDepth: vi.fn().mockReturnThis(),
			setPadding: vi.fn().mockReturnThis(),
			setVisible: vi.fn().mockReturnThis(),
			setPosition: vi.fn().mockReturnThis(),
		};
		scene.add.text.mockReturnValue(tooltipMock);
		controller = new PlayerController(scene as any, gridEngine, quadtree);

		controller.handleMovement();

		expect(tooltipMock.setVisible).toHaveBeenCalledWith(true);
		expect(tooltipMock.setPosition).toHaveBeenCalled();
	});

	it('should hide tooltip when not near any objects', () => {
		quadtree = createMockQuadtree([]);
		const tooltipMock = {
			setDepth: vi.fn().mockReturnThis(),
			setPadding: vi.fn().mockReturnThis(),
			setVisible: vi.fn().mockReturnThis(),
			setPosition: vi.fn().mockReturnThis(),
		};
		scene.add.text.mockReturnValue(tooltipMock);
		controller = new PlayerController(scene as any, gridEngine, quadtree);

		controller.handleMovement();

		expect(tooltipMock.setVisible).toHaveBeenCalledWith(false);
	});
});
