import { describe, it, expect, vi } from 'vitest';
import { GameObjectPool } from './object-pool';

vi.mock('phaser', () => ({ default: {} }));

function makeObj() {
	return {
		setActive: vi.fn().mockReturnThis(),
		setVisible: vi.fn().mockReturnThis(),
	};
}

describe('GameObjectPool', () => {
	it('makes a fresh object on a cold pool and activates it', () => {
		const obj = makeObj();
		const make = vi.fn().mockReturnValue(obj);
		const pool = new GameObjectPool(make as never);
		const out = pool.acquire();
		expect(make).toHaveBeenCalledTimes(1);
		expect(out).toBe(obj);
		expect(obj.setActive).toHaveBeenCalledWith(true);
		expect(obj.setVisible).toHaveBeenCalledWith(true);
	});

	it('reuses a released object instead of making a new one', () => {
		const obj = makeObj();
		const make = vi.fn().mockReturnValue(obj);
		const pool = new GameObjectPool(make as never);
		const a = pool.acquire();
		pool.release(a);
		expect(obj.setActive).toHaveBeenLastCalledWith(false);
		expect(obj.setVisible).toHaveBeenLastCalledWith(false);
		const b = pool.acquire();
		expect(b).toBe(a);
		expect(make).toHaveBeenCalledTimes(1);
	});

	it('grows under concurrent demand and recycles in LIFO order', () => {
		let n = 0;
		const make = vi.fn().mockImplementation(() => {
			n += 1;
			return { id: n, setActive: vi.fn().mockReturnThis(), setVisible: vi.fn().mockReturnThis() };
		});
		const pool = new GameObjectPool(make as never);
		const a = pool.acquire();
		const b = pool.acquire();
		expect(make).toHaveBeenCalledTimes(2);
		pool.release(a);
		pool.release(b);
		expect(pool.acquire()).toBe(b);
		expect(pool.acquire()).toBe(a);
	});
});
