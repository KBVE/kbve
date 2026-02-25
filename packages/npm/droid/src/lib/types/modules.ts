import type { Remote } from 'comlink';

export interface ModInitContext {
	emitFromWorker?: (msg: unknown) => void;
}

export interface BaseModAPI {
	getMeta(): Promise<ModMeta>;
	init?(ctx: ModInitContext): void | Promise<void>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
	queryTestTable(): Promise<{ data: unknown; error: unknown }>;
	insertTest(
		payload: Record<string, unknown>,
	): Promise<{ data: unknown; error: unknown }>;
}

export type VirtualNode = {
	tag: string;
	id?: string;
	key?: string;
	class?: string;
	attrs?: Record<string, string | number | boolean>;
	style?: Partial<CSSStyleDeclaration>;
	children?: (string | VirtualNode)[];
};
