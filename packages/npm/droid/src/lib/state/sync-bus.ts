import {
	clearProfileCache,
	setProfileCache,
	type DroidProfile,
} from './profile';
import { clearStaffPermsCache, setStaffPermsCache } from './staff';

const CHANNEL_NAME = 'kbve-droid-sync';

export type SyncBusMessage =
	| { type: 'profile-refresh'; profile: DroidProfile }
	| { type: 'profile-clear' }
	| {
			type: 'staff-refresh';
			user_id: string;
			bitmask: number;
	  }
	| { type: 'staff-clear' };

let channel: BroadcastChannel | null = null;
let installed = false;

function getChannel(): BroadcastChannel | null {
	if (typeof BroadcastChannel === 'undefined') return null;
	if (!channel) {
		try {
			channel = new BroadcastChannel(CHANNEL_NAME);
		} catch {
			channel = null;
		}
	}
	return channel;
}

/**
 * Subscribe to cross-context cache refresh messages. The service
 * worker / shared worker / other tabs can post `SyncBusMessage`
 * values to update the persistent stores. localStorage `storage`
 * events already handle cross-tab sync for the persistentAtom
 * itself; this bus exists so workers (which have no localStorage)
 * can drive writes through.
 */
const noop = (): void => {
	/* no-op cleanup */
};

export function installSyncBusListener(): () => void {
	if (installed) return noop;
	const bc = getChannel();
	if (!bc) return noop;
	installed = true;

	const onMessage = (event: MessageEvent<SyncBusMessage>) => {
		const msg = event.data;
		if (!msg || typeof msg !== 'object') return;
		switch (msg.type) {
			case 'profile-refresh':
				if (msg.profile?.user_id) setProfileCache(msg.profile);
				break;
			case 'profile-clear':
				clearProfileCache();
				break;
			case 'staff-refresh':
				if (msg.user_id && typeof msg.bitmask === 'number') {
					setStaffPermsCache(msg.user_id, msg.bitmask);
				}
				break;
			case 'staff-clear':
				clearStaffPermsCache();
				break;
		}
	};

	bc.addEventListener('message', onMessage);

	return () => {
		bc.removeEventListener('message', onMessage);
		installed = false;
	};
}

export function broadcastProfileRefresh(profile: DroidProfile): void {
	if (!profile?.user_id) return;
	getChannel()?.postMessage({
		type: 'profile-refresh',
		profile,
	} satisfies SyncBusMessage);
}

export function broadcastProfileClear(): void {
	getChannel()?.postMessage({
		type: 'profile-clear',
	} satisfies SyncBusMessage);
}

export function broadcastStaffRefresh(userId: string, bitmask: number): void {
	if (!userId) return;
	getChannel()?.postMessage({
		type: 'staff-refresh',
		user_id: userId,
		bitmask,
	} satisfies SyncBusMessage);
}

export function broadcastStaffClear(): void {
	getChannel()?.postMessage({
		type: 'staff-clear',
	} satisfies SyncBusMessage);
}
