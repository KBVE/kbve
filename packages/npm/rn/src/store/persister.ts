import { kvStore } from './kv';

export interface PersistedClientLike {
	timestamp: number;
	buster: string;
	clientState: unknown;
}

export interface AsyncPersister {
	persistClient(client: PersistedClientLike): Promise<void>;
	restoreClient(): Promise<PersistedClientLike | undefined>;
	removeClient(): Promise<void>;
}

export function createKvPersister(key = 'rq-cache'): AsyncPersister {
	return {
		persistClient: (client) => kvStore.set(key, client),
		restoreClient: async () =>
			(await kvStore.get<PersistedClientLike>(key)) ?? undefined,
		removeClient: () => kvStore.remove(key),
	};
}
