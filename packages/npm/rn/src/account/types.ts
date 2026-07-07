export interface StorageInfo {
	usage: number;
	quota: number;
	percent: number;
	itemCount: number;
}

export interface DeviceRow {
	label: string;
	value: string;
}

export interface DeviceInfo {
	rows: DeviceRow[];
}

export type HealthStatus = 'ok' | 'unavailable' | 'checking' | 'error';

export interface HealthCheck {
	label: string;
	status: HealthStatus;
	detail?: string;
}

export interface DataHook<T> {
	loading: boolean;
	data: T | null;
	refresh: () => void;
}

export interface StorageHook extends DataHook<StorageInfo> {
	clear: () => Promise<void>;
}
