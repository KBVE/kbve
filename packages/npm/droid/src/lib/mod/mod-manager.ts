import { wrap, proxy  } from 'comlink';
import type { Remote } from 'comlink';
import type { ModManager, ModHandle, ModMeta, BaseModAPI } from '../types/modules';
import type { KBVEGlobal } from '../../types'; 

const registry: Record<string, ModHandle> = {};


export async function initModManager(): Promise<ModManager> {

	async function load(url: string): Promise<ModHandle> {
		const worker = new Worker(url, { type: 'module' });
		const instance = wrap<BaseModAPI>(worker);

		const meta: ModMeta = await instance.getMeta?.() ?? {
			name: 'unknown',
			version: '0.0.1'
		};

		const id = `${meta.name}@${meta.version}`;
		console.log(`${id} is loaded.`);
	
		const handle: ModHandle = { id, worker, instance, meta, url };
		registry[id] = handle;
		return handle;
	}

	function unload(id: string) {
		const mod = registry[id];
		if (mod) {
			mod.worker.terminate();
			delete registry[id];
		}
	}

	function list() {
		return Object.values(registry).map(m => m.meta);
	}

	async function reload(id: string): Promise<ModHandle> {
		const mod = registry[id];
		if (!mod) throw new Error(`Mod "${id}" not found`);
		unload(id);
		return load(mod.url);
	}

	return {
		registry,
		load,
		unload,
		list,
		reload,
	};
}