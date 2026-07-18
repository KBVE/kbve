import { useCallback, useEffect, useState } from 'react';
import type { StorageHook, StorageInfo } from './types';
import { toStorageInfo } from './storageMath';
import { clearStorage } from './clearStorage';

async function read(): Promise<StorageInfo> {
	let itemCount = 0;
	try {
		itemCount = localStorage.length;
	} catch {
		itemCount = 0;
	}
	let usage = 0;
	let quota = 0;
	try {
		if (navigator.storage?.estimate) {
			const est = await navigator.storage.estimate();
			usage = est.usage ?? 0;
			quota = est.quota ?? 0;
		}
	} catch {
		usage = 0;
		quota = 0;
	}
	return toStorageInfo(usage, quota, itemCount);
}

export function useStorageInfo(): StorageHook {
	const [data, setData] = useState<StorageInfo | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setLoading(true);
		void read().then((info) => {
			setData(info);
			setLoading(false);
		});
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const clear = useCallback(async () => {
		await clearStorage();
		refresh();
	}, [refresh]);

	return { data, loading, refresh, clear };
}
