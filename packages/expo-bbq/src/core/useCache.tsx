import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // ? Defaults to 24 Hours Cache

interface CacheData<T> {
	data: T;
	timestamp: number;
}

const setCacheItem = async <T,>(key: string, value: T): Promise<void> => {
	const data: CacheData<T> = { data: value, timestamp: Date.now() };
	const jsonData = JSON.stringify(data);

	if (Platform.OS === 'web') {
		localStorage.setItem(key, jsonData);
	} else {
		await AsyncStorage.setItem(key, jsonData);
	}
};

const getCacheItem = async <T,>(key: string): Promise<CacheData<T> | null> => {
	let cachedItem: string | null;

	if (Platform.OS === 'web') {
		cachedItem = localStorage.getItem(key);
	} else {
		cachedItem = await AsyncStorage.getItem(key);
	}

	return cachedItem ? (JSON.parse(cachedItem) as CacheData<T>) : null;
};

const isCacheExpired = (cachedTimestamp: number): boolean => {
	const now = Date.now();
	return now - cachedTimestamp > CACHE_EXPIRY_TIME;
};

export const useCache = <T,>(key: string, fetchData: () => Promise<T>) => {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadData = async () => {
			setLoading(true);

			const cachedItem = await getCacheItem<T>(key);
			if (cachedItem && !isCacheExpired(cachedItem.timestamp)) {
				setData(cachedItem.data);
				setLoading(false);
				return;
			}

			if (fetchData) {
				const freshData = await fetchData();
				setData(freshData);

				await setCacheItem(key, freshData);
			}

			setLoading(false);
		};

		loadData();
	}, [key, fetchData]);

	return { data, loading };
};

export default useCache;
