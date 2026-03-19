import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useSettingsStore } from './settings';
import { viewUpdateConfig } from '../engine/bridge';

// Mock the bridge module before importing the store
vi.mock('../engine/bridge', () => ({
	viewUpdateConfig: vi.fn(() => Promise.resolve()),
}));

describe('Settings Store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSettingsStore.setState({
			theme: 'dark',
			launchAtLogin: false,
			startMinimized: false,
			language: 'en',
		});
	});

	it('has correct initial state', () => {
		const state = useSettingsStore.getState();
		expect(state.theme).toBe('dark');
		expect(state.launchAtLogin).toBe(false);
		expect(state.startMinimized).toBe(false);
		expect(state.language).toBe('en');
	});

	it('sets theme and syncs to backend', () => {
		useSettingsStore.getState().setTheme('light');
		expect(useSettingsStore.getState().theme).toBe('light');
		expect(viewUpdateConfig).toHaveBeenCalledWith('general', {
			theme: 'light',
		});
	});

	it('sets launch at login and syncs to backend', () => {
		useSettingsStore.getState().setLaunchAtLogin(true);
		expect(useSettingsStore.getState().launchAtLogin).toBe(true);
		expect(viewUpdateConfig).toHaveBeenCalledWith('general', {
			launch_at_login: true,
		});
	});

	it('sets start minimized and syncs to backend', () => {
		useSettingsStore.getState().setStartMinimized(true);
		expect(useSettingsStore.getState().startMinimized).toBe(true);
		expect(viewUpdateConfig).toHaveBeenCalledWith('general', {
			start_minimized: true,
		});
	});

	it('sets language and syncs to backend', () => {
		useSettingsStore.getState().setLanguage('es');
		expect(useSettingsStore.getState().language).toBe('es');
		expect(viewUpdateConfig).toHaveBeenCalledWith('general', {
			language: 'es',
		});
	});

	it('each setter only syncs its own field', () => {
		useSettingsStore.getState().setTheme('system');
		expect(viewUpdateConfig).toHaveBeenCalledTimes(1);
		expect(viewUpdateConfig).toHaveBeenCalledWith('general', {
			theme: 'system',
		});
	});
});
