import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { swRecovery } from './sw-recovery';

type Reg = {
	scriptURL: string;
	unregister: ReturnType<typeof vi.fn>;
};

function makeReg(scriptURL: string, unregisterReturn = true): Reg {
	return {
		scriptURL,
		unregister: vi.fn().mockResolvedValue(unregisterReturn),
	};
}

function installNavigator(regs: Reg[]) {
	const registrations = regs.map((r) => ({
		active: { scriptURL: r.scriptURL },
		installing: null,
		waiting: null,
		unregister: r.unregister,
	})) as unknown as ServiceWorkerRegistration[];

	Object.defineProperty(globalThis, 'navigator', {
		value: {
			serviceWorker: {
				getRegistrations: vi.fn().mockResolvedValue(registrations),
			},
		},
		configurable: true,
		writable: true,
	});
}

function installCaches(keys: string[]) {
	const cacheStore: Record<string, boolean> = Object.fromEntries(
		keys.map((k) => [k, true]),
	);
	(globalThis as unknown as { caches: CacheStorage }).caches = {
		keys: vi.fn().mockResolvedValue([...keys]),
		delete: vi.fn(async (key: string) => {
			const had = !!cacheStore[key];
			delete cacheStore[key];
			return had;
		}),
		match: vi.fn(),
		has: vi.fn(),
		open: vi.fn(),
	} as unknown as CacheStorage;
}

function clearGlobals() {
	delete (globalThis as unknown as { navigator?: unknown }).navigator;
	delete (globalThis as unknown as { caches?: unknown }).caches;
}

beforeEach(() => {
	clearGlobals();
	vi.spyOn(console, 'info').mockImplementation(vi.fn());
	vi.spyOn(console, 'warn').mockImplementation(vi.fn());
});

afterEach(() => {
	clearGlobals();
	vi.restoreAllMocks();
});

describe('swRecovery', () => {
	it('returns unsupported when navigator has no serviceWorker', async () => {
		Object.defineProperty(globalThis, 'navigator', {
			value: {},
			configurable: true,
			writable: true,
		});
		const result = await swRecovery();
		expect(result.supported).toBe(false);
		expect(result.unregistered).toEqual([]);
	});

	it('unregisters all SWs when allowedScripts is empty', async () => {
		const stale = makeReg('https://chat.kbve.com/sw.js');
		const other = makeReg('https://chat.kbve.com/old-sw.js');
		installNavigator([stale, other]);
		installCaches(['a', 'b']);

		const result = await swRecovery();
		expect(result.supported).toBe(true);
		expect(result.unregistered).toEqual([
			'https://chat.kbve.com/sw.js',
			'https://chat.kbve.com/old-sw.js',
		]);
		expect(result.keptScripts).toEqual([]);
		expect(result.cachesCleared).toEqual(['a', 'b']);
		expect(stale.unregister).toHaveBeenCalledTimes(1);
		expect(other.unregister).toHaveBeenCalledTimes(1);
	});

	it('keeps SWs whose absolute scriptURL is in allowedScripts', async () => {
		const keep = makeReg('https://chat.kbve.com/sw.js');
		const drop = makeReg('https://chat.kbve.com/legacy.js');
		installNavigator([keep, drop]);
		installCaches([]);

		const result = await swRecovery({
			allowedScripts: ['https://chat.kbve.com/sw.js'],
		});
		expect(result.keptScripts).toEqual(['https://chat.kbve.com/sw.js']);
		expect(result.unregistered).toEqual([
			'https://chat.kbve.com/legacy.js',
		]);
		expect(keep.unregister).not.toHaveBeenCalled();
		expect(drop.unregister).toHaveBeenCalledTimes(1);
	});

	it('keeps SWs whose pathname matches an allowed pathname rule', async () => {
		const keep = makeReg('https://chat.kbve.com/sw.js');
		installNavigator([keep]);
		installCaches([]);

		const result = await swRecovery({
			allowedScripts: ['/sw.js'],
		});
		expect(result.keptScripts).toEqual(['https://chat.kbve.com/sw.js']);
		expect(keep.unregister).not.toHaveBeenCalled();
	});

	it('skips cache clearing when clearCaches is false', async () => {
		installNavigator([makeReg('https://chat.kbve.com/old.js')]);
		installCaches(['x']);

		const result = await swRecovery({ clearCaches: false });
		expect(result.cachesCleared).toEqual([]);
	});

	it('does not reload when nothing was removed', async () => {
		installNavigator([]);
		installCaches([]);

		const reload = vi.fn();
		Object.defineProperty(globalThis, 'window', {
			value: { location: { reload } },
			configurable: true,
			writable: true,
		});

		const result = await swRecovery({ reloadOnCleanup: true });
		expect(result.reloaded).toBe(false);
		expect(reload).not.toHaveBeenCalled();
	});

	it('continues when an individual unregister rejects', async () => {
		const ok = makeReg('https://chat.kbve.com/a.js');
		const bad: Reg = {
			scriptURL: 'https://chat.kbve.com/b.js',
			unregister: vi.fn().mockRejectedValue(new Error('boom')),
		};
		installNavigator([ok, bad]);
		installCaches([]);

		const result = await swRecovery();
		expect(result.unregistered).toEqual(['https://chat.kbve.com/a.js']);
		expect(ok.unregister).toHaveBeenCalled();
		expect(bad.unregister).toHaveBeenCalled();
	});
});
