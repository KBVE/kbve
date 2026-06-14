import type {
	AgentClientCommand,
	AgentConnectionConfig,
	AgentServerEvent,
	AgentSession,
	AgentSessionStatus,
	FileDiff,
	ToolCallRequest,
} from './types';

export type ConnectionState = 'offline' | 'connecting' | 'online';

export interface TranscriptEntry {
	id: string;
	role: 'assistant' | 'tool';
	text: string;
}

export interface CoreState {
	connection: ConnectionState;
	session: AgentSession | null;
	status: AgentSessionStatus;
	transcript: TranscriptEntry[];
	pendingApprovals: ToolCallRequest[];
	diffs: FileDiff[];
	error: string | null;
	seq: number;
}

export const initialState: CoreState = {
	connection: 'offline',
	session: null,
	status: 'idle',
	transcript: [],
	pendingApprovals: [],
	diffs: [],
	error: null,
	seq: 0,
};

export type CoreEvent =
	| { type: 'connect'; config: AgentConnectionConfig }
	| { type: 'connected' }
	| { type: 'disconnected' }
	| { type: 'connect_error'; message: string }
	| { type: 'open_session'; repo?: string; branch?: string }
	| { type: 'send_prompt'; text: string }
	| { type: 'approve'; callId: string }
	| { type: 'deny'; callId: string; reason?: string }
	| { type: 'interrupt' }
	| { type: 'close_session' }
	| { type: 'inbound'; event: AgentServerEvent };

export type CoreEffect =
	| { type: 'ws.connect'; config: AgentConnectionConfig }
	| { type: 'ws.send'; command: AgentClientCommand }
	| { type: 'ws.close' };

export interface PendingApprovalView {
	callId: string;
	tool: string;
	summary: string;
}

export interface AgentViewModel {
	connection: ConnectionState;
	status: AgentSessionStatus;
	connected: boolean;
	canSend: boolean;
	repo: string | null;
	branch: string | null;
	transcript: TranscriptEntry[];
	pendingApproval: PendingApprovalView | null;
	diffs: FileDiff[];
	error: string | null;
}
