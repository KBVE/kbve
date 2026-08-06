import { describe, it, expect, beforeEach } from 'vitest';

import {
	__setInvokeHandler,
	__resetInvokeMock,
	__invokeCalls,
} from '../__mocks__/tauri-api-core';
import { useDevOpsStore } from './devopsStore';

const AGENT = {
	session: 'agent-issue-7',
	issue_ref: 'kbve/kbve#7',
	repo: 'kbve/kbve',
	issue_number: 7,
	worktree: '/tmp/wt',
	agent_type: 'claude',
	machine_id: 'mac-1',
	started_at: '2026-01-01T00:00:00Z',
	is_attached: false,
	is_local: true,
};

describe('DevOps Store', () => {
	beforeEach(() => {
		__resetInvokeMock();
		useDevOpsStore.setState({
			agents: [],
			agentsError: null,
			agentsLoading: false,
			sessions: [],
			recoveredSessions: [],
			isTmuxRunning: false,
			sessionsError: null,
			completingWork: null,
		});
	});

	it('setAgentFilterMode updates the filter', () => {
		useDevOpsStore.getState().setAgentFilterMode('remote');
		expect(useDevOpsStore.getState().agentFilterMode).toBe('remote');
	});

	it('refreshAgents stores agents on ok result', async () => {
		__setInvokeHandler((cmd) => {
			if (cmd === 'list_agent_statuses') return [AGENT];
			return undefined;
		});
		await useDevOpsStore.getState().refreshAgents();
		const state = useDevOpsStore.getState();
		expect(state.agents).toHaveLength(1);
		expect(state.agents[0].session).toBe('agent-issue-7');
		expect(state.agentsError).toBeNull();
	});

	it('refreshAgents surfaces backend errors', async () => {
		__setInvokeHandler((cmd) => {
			if (cmd === 'list_agent_statuses') {
				// Non-Error throw is what the generated bindings turn into
				// a { status: 'error' } result.
				throw 'gh not authenticated';
			}
			return undefined;
		});
		await useDevOpsStore.getState().refreshAgents();
		expect(useDevOpsStore.getState().agentsError).toBe(
			'gh not authenticated',
		);
	});

	it('refreshSessions clears sessions when tmux is not running', async () => {
		useDevOpsStore.setState({
			sessions: [
				{ name: 'stale', attached: false, status: 'Running' },
			] as never,
			isTmuxRunning: true,
		});
		__setInvokeHandler((cmd) =>
			cmd === 'is_tmux_running' ? false : undefined,
		);
		await useDevOpsStore.getState().refreshSessions();
		const state = useDevOpsStore.getState();
		expect(state.isTmuxRunning).toBe(false);
		expect(state.sessions).toHaveLength(0);
	});

	it('completeAgentWork announces the pull request by voice', async () => {
		__setInvokeHandler((cmd) => {
			if (cmd === 'list_agent_statuses') return [];
			return undefined;
		});
		await useDevOpsStore
			.getState()
			.completeAgentWork(AGENT as never, 'Fix for kbve/kbve#7');
		const announce = __invokeCalls.find(
			(c) => c.cmd === 'agent_voice_announce',
		);
		expect(announce).toBeDefined();
		expect(String((announce?.args as { text: string }).text)).toContain(
			'kbve/kbve#7',
		);
	});

	it('completeAgentWork refuses agents without an issue ref', async () => {
		await useDevOpsStore
			.getState()
			.completeAgentWork({ ...AGENT, issue_ref: null } as never, 'title');
		expect(useDevOpsStore.getState().agentsError).toBe(
			'Agent has no issue reference',
		);
		expect(__invokeCalls).toHaveLength(0);
	});
});
