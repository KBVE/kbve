// src/lib/gateway/capabilities.ts
// Browser capability detection for strategy selection

import type { BrowserCapabilities, StrategyType } from './types';

/**
 * Detect browser capabilities for worker and communication support
 */
export function detectCapabilities(): BrowserCapabilities {
	// SSR guard
	if (typeof window === 'undefined') {
		return {
			hasSharedWorker: false,
			hasWorker: false,
			hasBroadcastChannel: false,
			isAndroid: false,
			isSafari: false,
		};
	}

	const userAgent = navigator.userAgent || '';

	return {
		hasSharedWorker: typeof SharedWorker !== 'undefined',
		hasWorker: typeof Worker !== 'undefined',
		hasBroadcastChannel: typeof BroadcastChannel !== 'undefined',
		isAndroid: /Android/i.test(userAgent),
		isSafari: /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent),
	};
}

/**
 * Select the best strategy based on browser capabilities
 *
 * Priority:
 * 1. SharedWorker + Worker Pool (desktop Chrome, Firefox, Edge)
 * 2. WebWorker Pool only (Android, Safari, or no SharedWorker)
 * 3. Direct/Main thread (emergency fallback)
 */
export function selectStrategy(
	capabilities?: BrowserCapabilities,
): StrategyType {
	const caps = capabilities || detectCapabilities();

	// Desktop with SharedWorker support (best performance)
	if (caps.hasSharedWorker && caps.hasBroadcastChannel && !caps.isAndroid) {
		return 'shared-worker';
	}

	// Android or browsers without SharedWorker (still use worker pool)
	if (caps.hasWorker && caps.hasBroadcastChannel) {
		return 'web-worker';
	}

	// Fallback to main thread (no workers or BroadcastChannel)
	return 'direct';
}

/**
 * Log detected capabilities for debugging
 */
export function logCapabilities(capabilities: BrowserCapabilities) {
	console.log('[SupabaseGateway] Browser capabilities:', {
		SharedWorker: capabilities.hasSharedWorker ? '✓' : '✗',
		Worker: capabilities.hasWorker ? '✓' : '✗',
		BroadcastChannel: capabilities.hasBroadcastChannel ? '✓' : '✗',
		Platform: capabilities.isAndroid
			? 'Android'
			: capabilities.isSafari
				? 'Safari'
				: 'Desktop',
	});
}

/**
 * Get a human-readable description of the selected strategy
 */
export function getStrategyDescription(strategy: StrategyType): string {
	switch (strategy) {
		case 'shared-worker':
			return 'SharedWorker + DB Worker Pool (optimal for desktop)';
		case 'web-worker':
			return 'WebSocket Worker + DB Worker Pool (optimized for mobile)';
		case 'direct':
			return 'Direct/Main thread (compatibility fallback)';
	}
}
