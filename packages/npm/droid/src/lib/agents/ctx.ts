import type { AgentsEndpoints, ResolvedAgentsConfig } from './config';
import type { AgentsStore } from './state/atoms';

export type CallJsonResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: string };

export type CallVaultResult =
	| { ok: true; body: unknown }
	| { ok: false; error: string };

export type CallJson = <T>(
	url: string,
	body: Record<string, unknown>,
	opts?: { retriedAfterResync?: boolean },
) => Promise<CallJsonResult<T>>;

export type CallGuildVault = (
	command: string,
	accessToken: string,
	extra: Record<string, unknown>,
	opts?: { retriedAfterResync?: boolean },
) => Promise<CallVaultResult>;

export interface AgentsRuntime {
	initPromise: Promise<void> | null;
	lastInitAt: number;
	lastGuildFetchAt: number;
	guildsAbort: AbortController | null;
	tokensInflight: Map<string, Promise<void>>;
	tokensAbort: Map<string, AbortController>;
	bootstrapInflight: Promise<boolean> | null;
	lastBootstrapAt: number;
	lastBootstrapOk: boolean;
	refreshInflight: Promise<boolean> | null;
	lastForcedRefreshAt: number;
}

export function createRuntime(): AgentsRuntime {
	return {
		initPromise: null,
		lastInitAt: 0,
		lastGuildFetchAt: 0,
		guildsAbort: null,
		tokensInflight: new Map(),
		tokensAbort: new Map(),
		bootstrapInflight: null,
		lastBootstrapAt: 0,
		lastBootstrapOk: false,
		refreshInflight: null,
		lastForcedRefreshAt: 0,
	};
}

export interface AgentsCtx {
	config: ResolvedAgentsConfig;
	endpoints: AgentsEndpoints;
	store: AgentsStore;
	runtime: AgentsRuntime;
	callJson: CallJson;
	callGuildVault: CallGuildVault;
	resyncOwnedGuilds: () => Promise<boolean>;
}
