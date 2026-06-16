import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KVStore } from './types';

const PREFIX = 'kbve:';

export const kvStore: KVStore = {
	async get(key) {
		const raw = await AsyncStorage.getItem(PREFIX + key);
		return raw ? JSON.parse(raw) : null;
	},
	async set(key, value) {
		await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
	},
	async remove(key) {
		await AsyncStorage.removeItem(PREFIX + key);
	},
	async keys() {
		const all = await AsyncStorage.getAllKeys();
		return all
			.filter((k) => k.startsWith(PREFIX))
			.map((k) => k.slice(PREFIX.length));
	},
	async clear() {
		const all = await AsyncStorage.getAllKeys();
		const mine = all.filter((k) => k.startsWith(PREFIX));
		await AsyncStorage.multiRemove(mine);
	},
};
