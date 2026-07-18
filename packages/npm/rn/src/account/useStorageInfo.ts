import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageHook, StorageInfo } from './types';
import { toStorageInfo } from './storageMath';
import { clearStorage } from './clearStorage';

async function read(): Promise<StorageInfo> {
	let itemCount = 0;
	let usage = 0;
	try {
		const keys = await AsyncStorage.getAllKeys();
		itemCount = keys.length;
		const entries = await AsyncStorage.multiGet(keys);
		for (const [key, value] of entries) {
			usage += key.length + (value ? value.length : 0);
		}
	} catch {
		void 0;
	}
	return toStorageInfo(usage, 0, itemCount);
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
		try {
			await clearStorage();
		} finally {
			refresh();
		}
	}, [refresh]);

	return { data, loading, refresh, clear };
}
