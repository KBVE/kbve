import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';
import type { DataHook, DeviceInfo, DeviceRow } from './types';

function nativeRows(): DeviceRow[] {
	const { width, height } = Dimensions.get('window');
	const rows: DeviceRow[] = [
		{ label: 'OS', value: `${Platform.OS} ${String(Platform.Version)}` },
		{
			label: 'Screen',
			value: `${Math.round(width)}×${Math.round(height)}`,
		},
	];
	return rows;
}

export function useDeviceInfo(): DataHook<DeviceInfo> {
	const [data, setData] = useState<DeviceInfo | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setData({ rows: nativeRows() });
		setLoading(false);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, loading, refresh };
}
