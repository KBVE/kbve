/// <reference lib="webworker" />

import type { Remote } from 'comlink'
import type { LocalStorageAPI } from 'src/layout/scripts/workers/db-worker'
import { i18n as I18nInstance } from 'src/layout/scripts/workers/main'

import type { Alpine } from 'alpinejs';

declare global {
	var Alpine: Alpine;
	interface Window {
		Alpine: Alpine;
		kbve?: {
			api: Remote<LocalStorageAPI>
			i18n: typeof I18nInstance
		}
	}
}