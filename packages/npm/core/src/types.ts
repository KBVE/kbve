export type AgentSessionId = string;

export type AgentSessionStatus =
	| 'idle'
	| 'connecting'
	| 'running'
	| 'waiting_approval'
	| 'error'
	| 'closed';

export interface AgentSession {
	id: AgentSessionId;
	status: AgentSessionStatus;
	repo?: string;
	branch?: string;
	startedAt: number;
}

export interface ToolCallRequest {
	callId: string;
	tool: string;
	input: unknown;
	requiresApproval: boolean;
}

export interface ToolCallResult {
	callId: string;
	tool: string;
	ok: boolean;
	output?: unknown;
	error?: string;
}

export interface FileDiff {
	path: string;
	patch: string;
	additions: number;
	deletions: number;
}

export type AgentServerEvent =
	| { type: 'session.opened'; session: AgentSession }
	| {
			type: 'session.status';
			sessionId: AgentSessionId;
			status: AgentSessionStatus;
	  }
	| { type: 'assistant.delta'; sessionId: AgentSessionId; text: string }
	| { type: 'assistant.message'; sessionId: AgentSessionId; text: string }
	| { type: 'tool.request'; sessionId: AgentSessionId; call: ToolCallRequest }
	| { type: 'tool.result'; sessionId: AgentSessionId; result: ToolCallResult }
	| { type: 'diff'; sessionId: AgentSessionId; diff: FileDiff }
	| { type: 'error'; sessionId: AgentSessionId; message: string }
	| { type: 'session.closed'; sessionId: AgentSessionId };

export type AgentClientCommand =
	| { type: 'session.open'; repo?: string; branch?: string }
	| { type: 'prompt'; sessionId: AgentSessionId; text: string }
	| { type: 'tool.approve'; sessionId: AgentSessionId; callId: string }
	| {
			type: 'tool.deny';
			sessionId: AgentSessionId;
			callId: string;
			reason?: string;
	  }
	| { type: 'interrupt'; sessionId: AgentSessionId }
	| { type: 'session.close'; sessionId: AgentSessionId };

export interface AgentConnectionConfig {
	url: string;
	token: string;
}
