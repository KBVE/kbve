import type { DroidEvents } from './lib/workers/events';
import type { FlexDataAPI } from './lib/workers/data';
import type { ModManager } from './lib/types/modules';
import type { SupabaseGateway } from './lib/gateway/SupabaseGateway';
import type { ToastPayload } from './lib/types/ui-event-types';
import type { DroidScaleLevel } from './lib/workers/main';
import type { OverlayManager } from './lib/state/overlay-manager';

export interface KBVEGlobal {
	api?: unknown;
	i18n?: unknown;
	uiux?: Record<string, unknown>;
	ws?: unknown;
	data?: FlexDataAPI;
	mod?: ModManager;
	events: typeof DroidEvents;
	overlay?: OverlayManager;
	gateway?: SupabaseGateway;
	downscale?: () => Promise<void>;
	upscale?: () => Promise<void>;
	scaleLevel?: () => DroidScaleLevel;
	[key: string]: unknown;
}

declare global {
	interface Window {
		kbve: KBVEGlobal;
		__kbveToastQueue?: ToastPayload[] | null;
	}
}
