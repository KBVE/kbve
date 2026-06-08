import type { AgentsCtx } from '../ctx';
import type { AgentsApi } from '../api-types';
import type {
	EventQueueStats,
	FailedEvent,
	PendingEvent,
	Result,
} from '../types';

export function makeEvents(ctx: AgentsCtx, api: AgentsApi) {
	const { store, endpoints } = ctx;

	async function loadEventStats(guildId: string): Promise<void> {
		store.$eventStatsLoading.set({
			...store.$eventStatsLoading.get(),
			[guildId]: true,
		});
		const r = await ctx.callJson<EventQueueStats>(endpoints.ghAdmin, {
			command: 'events.stats',
			server_id: guildId,
		});
		const loading = { ...store.$eventStatsLoading.get() };
		delete loading[guildId];
		store.$eventStatsLoading.set(loading);
		if (!r.ok) return;
		store.$eventStats.set({
			...store.$eventStats.get(),
			[guildId]: r.data,
		});
	}

	async function loadFailedEvents(
		guildId: string,
		limit = 10,
	): Promise<void> {
		store.$failedEventsLoading.set({
			...store.$failedEventsLoading.get(),
			[guildId]: true,
		});
		const r = await ctx.callJson<{ events: FailedEvent[] }>(
			endpoints.ghAdmin,
			{ command: 'events.failed', server_id: guildId, limit },
		);
		const loading = { ...store.$failedEventsLoading.get() };
		delete loading[guildId];
		store.$failedEventsLoading.set(loading);
		if (!r.ok) return;
		store.$failedEvents.set({
			...store.$failedEvents.get(),
			[guildId]: r.data.events ?? [],
		});
	}

	async function loadPendingEvents(
		guildId: string,
		limit = 10,
	): Promise<void> {
		store.$pendingEventsLoading.set({
			...store.$pendingEventsLoading.get(),
			[guildId]: true,
		});
		const r = await ctx.callJson<{ events: PendingEvent[] }>(
			endpoints.ghAdmin,
			{ command: 'events.pending', server_id: guildId, limit },
		);
		const loading = { ...store.$pendingEventsLoading.get() };
		delete loading[guildId];
		store.$pendingEventsLoading.set(loading);
		if (!r.ok) return;
		store.$pendingEvents.set({
			...store.$pendingEvents.get(),
			[guildId]: r.data.events ?? [],
		});
	}

	async function requeueEvent(
		guildId: string,
		eventId: number,
		reason?: string,
	): Promise<Result> {
		const key = `${guildId}:${eventId}`;
		store.$eventRequeueBusyFor.set({
			...store.$eventRequeueBusyFor.get(),
			[key]: true,
		});
		const trimmedReason =
			typeof reason === 'string' && reason.trim().length > 0
				? reason.trim().slice(0, 512)
				: undefined;
		const r = await ctx.callJson<{ requeued: boolean; event_id: number }>(
			endpoints.ghAdmin,
			{
				command: 'events.requeue',
				server_id: guildId,
				event_id: eventId,
				...(trimmedReason ? { reason: trimmedReason } : {}),
			},
		);
		const busy = { ...store.$eventRequeueBusyFor.get() };
		delete busy[key];
		store.$eventRequeueBusyFor.set(busy);
		if (!r.ok) return { ok: false, error: r.error };
		const cur = store.$failedEvents.get()[guildId] ?? [];
		store.$failedEvents.set({
			...store.$failedEvents.get(),
			[guildId]: cur.filter((e) => e.id !== eventId),
		});
		void api.loadEventStats(guildId);
		return { ok: true };
	}

	return {
		loadEventStats,
		loadFailedEvents,
		loadPendingEvents,
		requeueEvent,
	};
}
