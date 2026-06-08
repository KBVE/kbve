import {
	buildEndpoints,
	resolveAgentsConfig,
	type AgentsConfig,
} from './config';
import { createAgentsStore } from './state/atoms';
import { createRuntime, type AgentsCtx } from './ctx';
import { makeCallJson } from './client/callJson';
import { makeCallGuildVault } from './client/callGuildVault';
import { makeAuth } from './auth/init';
import { makeGuilds } from './discord/guilds';
import { makeDiscordBot } from './discord/bot';
import { makeTokens } from './github/tokens';
import { makeRepoConfig } from './github/repoConfig';
import { makePat } from './github/pat';
import { makeWebhook } from './github/webhook';
import { makeBackfill } from './github/backfill';
import { makeEvents } from './github/events';
import type { AgentsApi } from './api-types';

export function createAgents(config: AgentsConfig): AgentsApi {
	const resolved = resolveAgentsConfig(config);
	const store = createAgentsStore();
	const runtime = createRuntime();

	const ctx = {
		config: resolved,
		endpoints: buildEndpoints(resolved.supabaseUrl),
		store,
		runtime,
		callJson: (() => {
			throw new Error('agents: callJson used before init');
		}) as AgentsCtx['callJson'],
		callGuildVault: (() => {
			throw new Error('agents: callGuildVault used before init');
		}) as AgentsCtx['callGuildVault'],
		resyncOwnedGuilds: async () => false,
	} as AgentsCtx;

	const api = { ...store } as AgentsApi;

	ctx.callJson = makeCallJson(ctx);
	ctx.callGuildVault = makeCallGuildVault(ctx);

	const auth = makeAuth(ctx, api);
	ctx.resyncOwnedGuilds = auth.resyncOwnedGuilds;

	Object.assign(
		api,
		auth,
		makeGuilds(ctx, api),
		makeTokens(ctx, api),
		makeRepoConfig(ctx, api),
		makePat(ctx, api),
		makeDiscordBot(ctx),
		makeWebhook(ctx, api),
		makeBackfill(ctx),
		makeEvents(ctx, api),
	);

	return api;
}
