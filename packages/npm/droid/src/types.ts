import type { DroidEvents } from './lib/workers/events';
import type { FlexDataAPI } from './lib/workers/data';
import type { ModManager } from './lib/types/modules';
import type { SupabaseGateway } from './lib/gateway/SupabaseGateway';
import type { ToastPayload } from './lib/types/ui-event-types';

export interface KBVEGlobal {
	api?: unknown;
	i18n?: unknown;
	uiux?: Record<string, unknown>;
	ws?: unknown;
	data?: FlexDataAPI;
	mod?: ModManager;
	events: typeof DroidEvents;
	gateway?: SupabaseGateway;
	[key: string]: unknown;
}

declare global {
	interface Window {
		kbve: KBVEGlobal;
		__kbveToastQueue?: ToastPayload[] | null;
	}
}
