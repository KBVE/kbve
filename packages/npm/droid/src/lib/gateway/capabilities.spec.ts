import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	detectCapabilities,
	getStrategyDescription,
	logCapabilities,
	selectStrategy,
} from './capabilities';

const realUA = navigator.userAgent;

afterEach(() => {
	Object.defineProperty(navigator, 'userAgent', {
		value: realUA,
		configurable: true,
	});
	vi.restoreAllMocks();
});

function setUA(ua: string) {
	Object.defineProperty(navigator, 'userAgent', {
		value: ua,
		configurable: true,
	});
}

describe('detectCapabilities', () => {
	it('flags Safari when Safari is in UA but Chrome is not', () => {
		setUA(
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
		);
		const caps = detectCapabilities();
		expect(caps.isSafari).toBe(true);
		expect(caps.isAndroid).toBe(false);
	});

	it('does not flag Safari for Chrome on macOS', () => {
		setUA(
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
		);
		const caps = detectCapabilities();
		expect(caps.isSafari).toBe(false);
	});

	it('flags Android UA', () => {
		setUA(
			'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
		);
		const caps = detectCapabilities();
		expect(caps.isAndroid).toBe(true);
	});
});

describe('selectStrategy', () => {
	it('picks shared-worker on capable desktop', () => {
		expect(
			selectStrategy({
				hasSharedWorker: true,
				hasWorker: true,
				hasBroadcastChannel: true,
				isAndroid: false,
				isSafari: false,
			}),
		).toBe('shared-worker');
	});

	it('falls back to web-worker on Android even with SharedWorker support', () => {
		expect(
			selectStrategy({
				hasSharedWorker: true,
				hasWorker: true,
				hasBroadcastChannel: true,
				isAndroid: true,
				isSafari: false,
			}),
		).toBe('web-worker');
	});

	it('falls back to web-worker without SharedWorker', () => {
		expect(
			selectStrategy({
				hasSharedWorker: false,
				hasWorker: true,
				hasBroadcastChannel: true,
				isAndroid: false,
				isSafari: true,
			}),
		).toBe('web-worker');
	});

	it('falls back to direct without BroadcastChannel', () => {
		expect(
			selectStrategy({
				hasSharedWorker: true,
				hasWorker: true,
				hasBroadcastChannel: false,
				isAndroid: false,
				isSafari: false,
			}),
		).toBe('direct');
	});

	it('returns direct when Worker is unavailable', () => {
		expect(
			selectStrategy({
				hasSharedWorker: false,
				hasWorker: false,
				hasBroadcastChannel: false,
				isAndroid: false,
				isSafari: false,
			}),
		).toBe('direct');
	});
});

describe('getStrategyDescription', () => {
	it('returns a description for every strategy variant', () => {
		expect(getStrategyDescription('shared-worker')).toMatch(/SharedWorker/);
		expect(getStrategyDescription('web-worker')).toMatch(/WebSocket/);
		expect(getStrategyDescription('direct')).toMatch(/Direct/);
	});
});

describe('logCapabilities', () => {
	it('writes a single console.log with the capability snapshot', () => {
		const spy = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		logCapabilities({
			hasSharedWorker: true,
			hasWorker: true,
			hasBroadcastChannel: true,
			isAndroid: false,
			isSafari: false,
		});
		expect(spy).toHaveBeenCalledTimes(1);
		const [, payload] = spy.mock.calls[0];
		expect(payload).toMatchObject({
			SharedWorker: 'yes',
			Worker: 'yes',
			BroadcastChannel: 'yes',
			Platform: 'Desktop',
		});
	});
});
