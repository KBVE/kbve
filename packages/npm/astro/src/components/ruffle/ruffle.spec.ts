import { describe, expect, it } from 'vitest';
import {
	mergeRuffleConfig,
	resolveRuffleScriptUrl,
	RUFFLE_DEFAULT_SCRIPT_URL,
} from './ruffle';

describe('ruffle cdn helpers', () => {
	it('defaults to the Ruffle unpkg package endpoint', () => {
		expect(resolveRuffleScriptUrl()).toBe(RUFFLE_DEFAULT_SCRIPT_URL);
	});

	it('supports pinned package versions for supported CDN presets', () => {
		expect(
			resolveRuffleScriptUrl({ version: '0.2.0-nightly.2025.9.6' }),
		).toBe('https://unpkg.com/@ruffle-rs/ruffle@0.2.0-nightly.2025.9.6');
		expect(
			resolveRuffleScriptUrl({
				cdn: 'jsdelivr',
				version: '0.2.0-nightly.2025.9.6',
			}),
		).toBe(
			'https://cdn.jsdelivr.net/npm/@ruffle-rs/ruffle@0.2.0-nightly.2025.9.6',
		);
	});

	it('lets an explicit script URL override CDN settings', () => {
		expect(
			resolveRuffleScriptUrl({
				cdn: 'jsdelivr',
				version: 'nightly',
				scriptUrl: 'https://cdn.example.com/ruffle.js',
			}),
		).toBe('https://cdn.example.com/ruffle.js');
	});

	it('merges local config over page config', () => {
		expect(
			mergeRuffleConfig(
				{ autoplay: 'auto', splashScreen: true },
				{ autoplay: 'on' },
			),
		).toEqual({ autoplay: 'on', splashScreen: true });
	});
});
