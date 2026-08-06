// End-to-end style test: renders the real DevOps view through the real
// generated bindings, with only the Tauri invoke boundary scripted.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import {
	__setInvokeHandler,
	__resetInvokeMock,
	__invokeCalls,
} from '../__mocks__/tauri-api-core';
import { DevOpsView } from './devops';

// Handlers return the RAW invoke payload; the generated bindings wrap it
// into { status: 'ok', data } and turn non-Error throws into
// { status: 'error', error }.
function scriptBackend(overrides: Record<string, unknown> = {}) {
	__setInvokeHandler((cmd) => {
		if (cmd in overrides) return overrides[cmd];
		switch (cmd) {
			case 'agent_voice_is_enabled':
				return false;
			case 'agent_voice_set_enabled':
			case 'agent_voice_announce':
				return null;
			case 'check_devops_dependencies':
				return {
					gh: {
						installed: true,
						version: '2.0',
						authenticated: true,
					},
					tmux: { installed: true, version: '3.4' },
					docker: { installed: false, version: null },
				};
			case 'get_enabled_agents':
				return ['claude'];
			case 'get_sandbox_enabled':
				return false;
			case 'check_claude_auth_volume':
				return false;
			case 'is_tmux_running':
				return false;
			case 'list_agent_statuses':
			case 'list_tmux_sessions':
			case 'recover_tmux_sessions':
			case 'list_pipeline_items':
				return [];
			case 'get_active_epic_state':
				return null;
			case 'get_current_machine_id':
				return 'test-machine';
			default:
				// Anything unscripted exercises the components' error paths.
				throw `unscripted: ${cmd}`;
		}
	});
}

describe('DevOps view (e2e-style)', () => {
	beforeEach(() => {
		__resetInvokeMock();
		scriptBackend();
	});

	it('renders the voice announcements card and the devops layout', async () => {
		render(<DevOpsView />);
		expect(screen.getByText('Voice announcements')).toBeDefined();
		await waitFor(() => {
			expect(
				__invokeCalls.some((c) => c.cmd === 'agent_voice_is_enabled'),
			).toBe(true);
		});
	});

	it('toggling voice announcements calls the backend', async () => {
		const { container } = render(<DevOpsView />);
		const toggle = container.querySelector('button');
		expect(toggle).not.toBeNull();
		fireEvent.click(toggle as HTMLButtonElement);
		await waitFor(() => {
			const call = __invokeCalls.find(
				(c) => c.cmd === 'agent_voice_set_enabled',
			);
			expect(call).toBeDefined();
			expect((call?.args as { enabled: boolean }).enabled).toBe(true);
		});
	});

	it('reflects a backend-enabled toggle on mount', async () => {
		__resetInvokeMock();
		scriptBackend({ agent_voice_is_enabled: true });
		render(<DevOpsView />);
		await waitFor(() => {
			expect(
				__invokeCalls.some((c) => c.cmd === 'agent_voice_is_enabled'),
			).toBe(true);
		});
	});
});
