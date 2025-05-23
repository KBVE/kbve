import type { Remote } from 'comlink';

export interface BaseModAPI {
	getMeta(): Promise<ModMeta>;
	init?(ctx: any): void | Promise<void>;
	[key: string]: any;
}

export interface ModMeta {
	name: string;
	version: string;
	description?: string;
	author?: string;
}

export interface ModHandle {
	id: string;
	worker: Worker;
	instance: Remote<BaseModAPI>;
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

export interface SupabaseModAPI extends BaseModAPI {
	configure(url: string, key: string): Promise<void>;
	queryTestTable(): Promise<{ data: any; error: any }>;
	insertTest(payload: Record<string, any>): Promise<{ data: any; error: any }>;
}

export type VirtualNode = {
	tag: string;
	id?: string;
	key?: string;
	class?: string;
	attrs?: Record<string, any>;
	style?: Partial<CSSStyleDeclaration>;
	children?: (string | VirtualNode)[];
};