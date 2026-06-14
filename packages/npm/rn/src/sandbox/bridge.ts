import type { Capability } from '../plugin/capability';
import type { PluginManifest } from '../plugin/manifest';

export interface HostCallContext {
	pluginId: string;
	manifest: PluginManifest;
	capability: Capability;
	method: string;
}

export type HostMethod = (
	params: unknown,
	ctx: HostCallContext,
) => Promise<unknown> | unknown;

export type HostApiTable = Partial<
	Record<Capability, Record<string, HostMethod>>
>;

export class CapabilityError extends Error {
	constructor(
		public readonly capability: Capability,
		public readonly reason: string,
	) {
		super(`capability "${capability}" denied: ${reason}`);
		this.name = 'CapabilityError';
	}
}

export interface HostBridgeConfig {
	manifest: PluginManifest;
	granted: readonly Capability[];
	api: HostApiTable;
}

export class HostBridge {
	constructor(private readonly config: HostBridgeConfig) {}

	private allows(capability: Capability): boolean {
		return (
			this.config.manifest.permissions.includes(capability) &&
			this.config.granted.includes(capability)
		);
	}

	async invoke(
		capability: Capability,
		method: string,
		params: unknown,
	): Promise<unknown> {
		if (!this.allows(capability)) {
			throw new CapabilityError(capability, 'not granted');
		}
		const methods = this.config.api[capability];
		const fn = methods ? methods[method] : undefined;
		if (!fn) {
			throw new CapabilityError(
				capability,
				`method "${method}" not implemented`,
			);
		}
		return fn(params, {
			pluginId: this.config.manifest.id,
			manifest: this.config.manifest,
			capability,
			method,
		});
	}
}

export function mergeApiTables(...tables: HostApiTable[]): HostApiTable {
	const merged: HostApiTable = {};
	for (const table of tables) {
		for (const key of Object.keys(table) as Capability[]) {
			merged[key] = { ...merged[key], ...table[key] };
		}
	}
	return merged;
}
