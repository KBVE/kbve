/// <reference lib="webworker" />

import type { Remote } from 'comlink';
import type { LocalStorageAPI } from './lib/workers/db-worker';
import type { WSInstance } from './lib/workers/ws-worker';
import { FlexDataAPI } from './lib/workers/data';
import type { ModManager } from './types/modules';
import type { DroidEventBus } from './lib/workers/events';

export interface KBVEGlobal {
	api: Remote<LocalStorageAPI>;
	i18n: typeof I18nInstance;
	uiux: typeof UiUxInstance;
	ws: Remote<WSInstance>;
	data: FlexDataAPI;
	mod: ModManager;
	events: DroidEventBus;

	// Helper Flags @GPT
	// droidReady?: boolean;
	// waitForDroidReady?: () => Promise<void>;

	//	<T>
	[key: string]: unknown;
}

declare global {
	interface Window {
		kbve?: KBVEGlobal;
	}
}
