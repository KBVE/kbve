/// <reference lib="webworker" />

import type { Alpine } from 'alpinejs';

declare global {
	var Alpine: Alpine;
	interface Window {
		Alpine: Alpine;
	}
}