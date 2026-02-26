import { wrap } from 'comlink';
import type {
	ModManager,
	ModHandle,
	ModMeta,
	BaseModAPI,
} from '../types/modules';

let _modManager: ModManager | null = null;

export async function getModManager(
	modWorkerResolver?: (url: string) => string,
): Promise<ModManager> {
	if (_modManager) return _modManager;

	const registry: Record<string, ModHandle> = {};

	async function load(url: string): Promise<ModHandle> {
		const resolvedURL = modWorkerResolver?.(url) ?? url;
		const worker = new Worker(resolvedURL, { type: 'module' });
		const instance = wrap<BaseModAPI>(worker);

		const meta: ModMeta = (await instance.getMeta?.()) ?? {
			name: 'unknown',
			version: '0.0.1',
		};

		const id = `${meta.name}@${meta.version}`;
		console.log(`[mod-manager] ${id} is loaded.`);

		// const modEventName = `kbve:droid-${meta.name}-ready`;
		// const event = new CustomEvent(modEventName, {
		// 	detail: {
		// 		meta,
		// 		timestamp: Date.now(),
		// 	},
		// });
		// window.dispatchEvent(event);

		// const camelName = meta.name.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
		// if (!window.kbve) {
		// 	window.kbve = {} as KBVEGlobal;
		// }
		// window.kbve[`droid${camelName[0].toUpperCase()}${camelName.slice(1)}Ready`] = true;

		const handle: ModHandle = { id, worker, instance, meta, url };
		registry[id] = handle;
		return handle;
	}

	function unload(id: string) {
		if (registry[id]) {
			registry[id].worker.terminate();
			delete registry[id];
		}
	}

	function list() {
		return Object.values(registry).map((m) => m.meta);
	}

	async function reload(id: string): Promise<ModHandle> {
		const mod = registry[id];
		if (!mod) throw new Error(`Mod "${id}" not found`);
		unload(id);
		return load(mod.url);
	}

	_modManager = {
		registry,
		load,
		unload,
		list,
		reload,
	};

	return _modManager;
}
