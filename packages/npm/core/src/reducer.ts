import { initialState } from './state';
import type {
	AgentViewModel,
	CoreEffect,
	CoreEvent,
	CoreState,
	TranscriptEntry,
} from './state';
import type { AgentServerEvent } from './types';

export interface UpdateResult {
	state: CoreState;
	effects: CoreEffect[];
}

export interface AgentCore {
	initial(): CoreState;
	update(state: CoreState, event: CoreEvent): UpdateResult;
	view(state: CoreState): AgentViewModel;
}

function sessionId(state: CoreState): string | null {
	return state.session ? state.session.id : null;
}

function appendAssistant(
	transcript: TranscriptEntry[],
	seq: number,
	text: string,
	merge: boolean,
): TranscriptEntry[] {
	const last = transcript[transcript.length - 1];
	if (merge && last && last.role === 'assistant') {
		const updated: TranscriptEntry = { ...last, text: last.text + text };
		return [...transcript.slice(0, -1), updated];
	}
	return [...transcript, { id: `a${seq}`, role: 'assistant', text }];
}

function applyInbound(state: CoreState, event: AgentServerEvent): CoreState {
	switch (event.type) {
		case 'session.opened':
			return {
				...state,
				session: event.session,
				status: event.session.status,
				error: null,
			};
		case 'session.status':
			return { ...state, status: event.status };
		case 'assistant.delta':
			return {
				...state,
				transcript: appendAssistant(
					state.transcript,
					state.seq,
					event.text,
					true,
				),
				status: 'running',
			};
		case 'assistant.message':
			return {
				...state,
				transcript: appendAssistant(
					state.transcript,
					state.seq,
					event.text,
					false,
				),
				status: 'running',
			};
		case 'tool.request':
			return {
				...state,
				pendingApprovals: event.call.requiresApproval
					? [...state.pendingApprovals, event.call]
					: state.pendingApprovals,
				status: event.call.requiresApproval
					? 'waiting_approval'
					: state.status,
			};
		case 'tool.result':
			return {
				...state,
				transcript: [
					...state.transcript,
					{
						id: `t${state.seq}`,
						role: 'tool',
						text: event.result.ok
							? `${event.result.tool} ok`
							: `${event.result.tool} failed: ${event.result.error ?? 'unknown'}`,
					},
				],
				status: 'running',
			};
		case 'diff':
			return { ...state, diffs: [...state.diffs, event.diff] };
		case 'error':
			return { ...state, error: event.message, status: 'error' };
		case 'session.closed':
			return { ...state, status: 'closed', session: null };
		default:
			return state;
	}
}

function reduce(state: CoreState, event: CoreEvent): UpdateResult {
	const sid = sessionId(state);
	switch (event.type) {
		case 'connect':
			return {
				state: { ...state, connection: 'connecting', error: null },
				effects: [{ type: 'ws.connect', config: event.config }],
			};
		case 'connected':
			return { state: { ...state, connection: 'online' }, effects: [] };
		case 'disconnected':
			return { state: { ...state, connection: 'offline' }, effects: [] };
		case 'connect_error':
			return {
				state: {
					...state,
					connection: 'offline',
					error: event.message,
				},
				effects: [],
			};
		case 'open_session':
			return {
				state: { ...state, status: 'connecting' },
				effects: [
					{
						type: 'ws.send',
						command: {
							type: 'session.open',
							repo: event.repo,
							branch: event.branch,
						},
					},
				],
			};
		case 'send_prompt':
			if (!sid) return { state, effects: [] };
			return {
				state: { ...state, status: 'running' },
				effects: [
					{
						type: 'ws.send',
						command: {
							type: 'prompt',
							sessionId: sid,
							text: event.text,
						},
					},
				],
			};
		case 'approve': {
			if (!sid) return { state, effects: [] };
			const pending = state.pendingApprovals.filter(
				(c) => c.callId !== event.callId,
			);
			return {
				state: {
					...state,
					pendingApprovals: pending,
					status: pending.length ? 'waiting_approval' : 'running',
				},
				effects: [
					{
						type: 'ws.send',
						command: {
							type: 'tool.approve',
							sessionId: sid,
							callId: event.callId,
						},
					},
				],
			};
		}
		case 'deny': {
			if (!sid) return { state, effects: [] };
			const pending = state.pendingApprovals.filter(
				(c) => c.callId !== event.callId,
			);
			return {
				state: {
					...state,
					pendingApprovals: pending,
					status: pending.length ? 'waiting_approval' : 'running',
				},
				effects: [
					{
						type: 'ws.send',
						command: {
							type: 'tool.deny',
							sessionId: sid,
							callId: event.callId,
							reason: event.reason,
						},
					},
				],
			};
		}
		case 'interrupt':
			if (!sid) return { state, effects: [] };
			return {
				state,
				effects: [
					{
						type: 'ws.send',
						command: { type: 'interrupt', sessionId: sid },
					},
				],
			};
		case 'close_session':
			if (!sid)
				return {
					state: { ...state, session: null, status: 'closed' },
					effects: [{ type: 'ws.close' }],
				};
			return {
				state: { ...state, status: 'closed' },
				effects: [
					{
						type: 'ws.send',
						command: { type: 'session.close', sessionId: sid },
					},
					{ type: 'ws.close' },
				],
			};
		case 'inbound':
			return { state: applyInbound(state, event.event), effects: [] };
		default:
			return { state, effects: [] };
	}
}

function project(state: CoreState): AgentViewModel {
	const connected = state.connection === 'online';
	const pending = state.pendingApprovals[0] ?? null;
	return {
		connection: state.connection,
		status: state.status,
		connected,
		canSend:
			connected &&
			state.session !== null &&
			state.status !== 'waiting_approval',
		repo: state.session?.repo ?? null,
		branch: state.session?.branch ?? null,
		transcript: state.transcript,
		pendingApproval: pending
			? {
					callId: pending.callId,
					tool: pending.tool,
					summary: pending.tool,
				}
			: null,
		diffs: state.diffs,
		error: state.error,
	};
}

export const tsCore: AgentCore = {
	initial: () => ({ ...initialState }),
	update: (state, event) => {
		const result = reduce(state, event);
		return {
			state: { ...result.state, seq: result.state.seq + 1 },
			effects: result.effects,
		};
	},
	view: project,
};
