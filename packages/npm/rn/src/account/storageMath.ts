import type { StorageInfo } from './types';

export function toStorageInfo(
	usage: number,
	quota: number,
	itemCount: number,
): StorageInfo {
	const raw = quota > 0 ? (usage / quota) * 100 : 0;
	const percent = Math.min(100, Math.round(raw));
	return { usage, quota, percent, itemCount };
}
