import { useCallback, useEffect, useState } from 'react';
import type { DataHook, DeviceInfo } from './types';
import { webDeviceRows } from './deviceRows';

export function useDeviceInfo(): DataHook<DeviceInfo> {
	const [data, setData] = useState<DeviceInfo | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		const nav = navigator as unknown as {
			userAgent?: string;
			platform?: string;
			language?: string;
			hardwareConcurrency?: number;
			deviceMemory?: number;
			onLine?: boolean;
		};
		setData({ rows: webDeviceRows(nav) });
		setLoading(false);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, loading, refresh };
}
