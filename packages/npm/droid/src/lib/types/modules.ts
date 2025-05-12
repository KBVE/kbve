import type { Remote } from 'comlink';

export interface ModMeta {
	name: string;
	version: string;
	description?: string;
	author?: string;
}

export interface ModHandle {
	id: string;
	worker: Worker;
	api: Remote<any>;
	meta: ModMeta;
	url: string;
}

export interface ModManager {
	registry: Record<string, ModHandle>;
	load: (url: string) => Promise<ModHandle>;
	unload: (id: string) => void;
	list: () => ModMeta[];
	reload: (id: string) => Promise<ModHandle>;
}