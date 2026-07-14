import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgentStore } from '@kbve/core';
import { toastStore } from '../ui/state/toastStore';
import type { ToastTone } from '../ui/state/toastStore';
import { CapabilityError } from './bridge';
import type { HostApiTable, HostMethod } from './bridge';

const STORAGE_PREFIX = 'kbve.plugin';

function storageKey(pluginId: string, key: string): string {
	return `${STORAGE_PREFIX}.${pluginId}.${key}`;
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string') {
		throw new Error(`expected string "${field}"`);
	}
	return value;
}

export function storageApi(): HostApiTable {
	const read: HostMethod = async (params, ctx) => {
		const key = requireString((params as { key?: unknown })?.key, 'key');
		return AsyncStorage.getItem(storageKey(ctx.pluginId, key));
	};
	const write: HostMethod = async (params, ctx) => {
		const p = params as { key?: unknown; value?: unknown };
		const key = requireString(p?.key, 'key');
		const value = requireString(p?.value, 'value');
		await AsyncStorage.setItem(storageKey(ctx.pluginId, key), value);
		return true;
	};
	const remove: HostMethod = async (params, ctx) => {
		const key = requireString((params as { key?: unknown })?.key, 'key');
		await AsyncStorage.removeItem(storageKey(ctx.pluginId, key));
		return true;
	};
	return {
		'storage:read': { get: read },
		'storage:write': { set: write, remove },
	};
}

export function netApi(): HostApiTable {
	const fetchMethod: HostMethod = async (params, ctx) => {
		const p = params as {
			url?: unknown;
			method?: unknown;
			headers?: unknown;
			body?: unknown;
		};
		const url = requireString(p?.url, 'url');
		const allowed = ctx.manifest.allowedHosts ?? [];
		const host = new URL(url).host;
		if (!allowed.includes(host)) {
			throw new CapabilityError(
				'net:fetch',
				`host "${host}" not allowed`,
			);
		}
		const response = await fetch(url, {
			method: typeof p.method === 'string' ? p.method : 'GET',
			headers:
				p.headers && typeof p.headers === 'object'
					? (p.headers as Record<string, string>)
					: undefined,
			body: typeof p.body === 'string' ? p.body : undefined,
		});
		const text = await response.text();
		return { status: response.status, ok: response.ok, body: text };
	};
	return { 'net:fetch': { fetch: fetchMethod } };
}

export function agentApi(store: AgentStore): HostApiTable {
	const snapshot: HostMethod = () => store.getSnapshot();
	const prompt: HostMethod = (params) => {
		const text = requireString(
			(params as { text?: unknown })?.text,
			'text',
		);
		store.dispatch({ type: 'send_prompt', text });
		return true;
	};
	const approve: HostMethod = (params) => {
		const callId = requireString(
			(params as { callId?: unknown })?.callId,
			'callId',
		);
		store.dispatch({ type: 'approve', callId });
		return true;
	};
	const deny: HostMethod = (params) => {
		const p = params as { callId?: unknown; reason?: unknown };
		const callId = requireString(p?.callId, 'callId');
		store.dispatch({
			type: 'deny',
			callId,
			reason: typeof p.reason === 'string' ? p.reason : undefined,
		});
		return true;
	};
	return {
		'agent:read': { snapshot },
		'agent:prompt': { prompt, approve, deny },
	};
}

export function notifyApi(): HostApiTable {
	const push: HostMethod = (params) => {
		const p = params as { message?: unknown; tone?: unknown };
		const message = requireString(p?.message, 'message');
		const tone =
			typeof p.tone === 'string' ? (p.tone as ToastTone) : undefined;
		return toastStore.push(message, tone);
	};
	return { notify: { toast: push } };
}

export interface DefaultHostApiOptions {
	agent?: AgentStore;
	storage?: boolean;
	net?: boolean;
	notify?: boolean;
}

export function defaultHostApi(
	options: DefaultHostApiOptions = {},
): HostApiTable {
	const tables: HostApiTable[] = [];
	if (options.storage !== false) tables.push(storageApi());
	if (options.net !== false) tables.push(netApi());
	if (options.notify !== false) tables.push(notifyApi());
	if (options.agent) tables.push(agentApi(options.agent));
	const merged: HostApiTable = {};
	for (const table of tables) {
		for (const key of Object.keys(table) as (keyof HostApiTable)[]) {
			merged[key] = { ...merged[key], ...table[key] };
		}
	}
	return merged;
}
