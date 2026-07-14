import type { Capability } from '../plugin/capability';
import type { UIEntity } from '../ui/models';

export type HostToPlugin =
	| { kind: 'host/init'; pluginId: string; capabilities: Capability[] }
	| { kind: 'host/response'; id: number; ok: true; result: unknown }
	| { kind: 'host/response'; id: number; ok: false; error: string }
	| { kind: 'host/event'; topic: string; payload: unknown };

export type PluginToHost =
	| { kind: 'plugin/ready' }
	| {
			kind: 'plugin/call';
			id: number;
			capability: Capability;
			method: string;
			params: unknown;
	  }
	| { kind: 'plugin/render'; entities: UIEntity[] }
	| {
			kind: 'plugin/log';
			level: 'debug' | 'info' | 'warn' | 'error';
			message: string;
	  }
	| { kind: 'plugin/error'; message: string };

export function parsePluginMessage(raw: string): PluginToHost | null {
	try {
		const value = JSON.parse(raw) as { kind?: unknown };
		if (typeof value.kind !== 'string') return null;
		if (!value.kind.startsWith('plugin/')) return null;
		return value as PluginToHost;
	} catch {
		return null;
	}
}

export function encodeHostMessage(message: HostToPlugin): string {
	return JSON.stringify(message);
}
