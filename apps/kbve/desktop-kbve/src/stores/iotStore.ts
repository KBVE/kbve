import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { commands, type BoardSnapshot, type DeviceSummary } from '../bindings';

const SNAPSHOT_EVENT = 'iot://snapshot';

type Status = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

interface IotState {
	status: Status;
	devices: DeviceSummary[];
	snapshot: BoardSnapshot | null;
	error: string | null;
	unlisten: UnlistenFn | null;

	scan: () => Promise<void>;
	connect: (deviceId: string) => Promise<void>;
	disconnect: () => Promise<void>;
	setBacklight: (pct: number) => Promise<void>;
	watch: () => Promise<void>;
	stopWatching: () => void;
}

export const useIotStore = create<IotState>((set, get) => ({
	status: 'idle',
	devices: [],
	snapshot: null,
	error: null,
	unlisten: null,

	async scan() {
		set({ status: 'scanning', error: null });
		const result = await commands.iotScan(null);
		if (result.status === 'error') {
			set({ status: 'error', error: result.error });
			return;
		}
		set({
			devices: result.data,
			status: get().snapshot?.connected ? 'connected' : 'idle',
		});
	},

	async connect(deviceId) {
		set({ status: 'connecting', error: null });
		const result = await commands.iotConnect(deviceId);
		if (result.status === 'error') {
			set({ status: 'error', error: result.error });
			return;
		}
		set({ snapshot: result.data, status: 'connected' });
	},

	async disconnect() {
		const result = await commands.iotDisconnect();
		if (result.status === 'error') {
			set({ error: result.error });
			return;
		}
		set({ snapshot: null, status: 'idle' });
	},

	async setBacklight(pct) {
		const clamped = Math.max(0, Math.min(100, Math.round(pct)));
		const snapshot = get().snapshot;
		if (snapshot) {
			set({ snapshot: { ...snapshot, backlight_pct: clamped } });
		}
		const result = await commands.iotSetBacklight(clamped);
		if (result.status === 'error') {
			set({ error: result.error });
		}
	},

	async watch() {
		if (get().unlisten) return;
		const unlisten = await listen<BoardSnapshot>(
			SNAPSHOT_EVENT,
			(event) => {
				set({
					snapshot: event.payload,
					status: event.payload.connected ? 'connected' : 'idle',
				});
			},
		);
		set({ unlisten });
	},

	stopWatching() {
		const { unlisten } = get();
		if (unlisten) {
			unlisten();
			set({ unlisten: null });
		}
	},
}));
