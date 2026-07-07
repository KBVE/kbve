import type { DeviceRow } from './types';

export interface WebNavLike {
	userAgent?: string;
	platform?: string;
	language?: string;
	hardwareConcurrency?: number;
	deviceMemory?: number;
	onLine?: boolean;
}

export function webDeviceRows(nav: WebNavLike): DeviceRow[] {
	const rows: DeviceRow[] = [];
	if (nav.userAgent) {
		const browser =
			nav.userAgent.split(/[()]/)[1] ?? nav.userAgent.slice(0, 60);
		rows.push({ label: 'Browser', value: browser });
	}
	if (nav.platform) rows.push({ label: 'Platform', value: nav.platform });
	if (nav.language) rows.push({ label: 'Language', value: nav.language });
	if (typeof nav.hardwareConcurrency === 'number') {
		rows.push({
			label: 'CPU cores',
			value: String(nav.hardwareConcurrency),
		});
	}
	if (typeof nav.deviceMemory === 'number') {
		rows.push({ label: 'Memory', value: `${nav.deviceMemory} GB` });
	}
	if (typeof nav.onLine === 'boolean') {
		rows.push({
			label: 'Network',
			value: nav.onLine ? 'Online' : 'Offline',
		});
	}
	return rows;
}
