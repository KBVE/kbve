export type Capability =
	| 'agent:read'
	| 'agent:prompt'
	| 'storage:read'
	| 'storage:write'
	| 'net:fetch'
	| 'ui:render'
	| 'clipboard'
	| 'notify';

export const ALL_CAPABILITIES: readonly Capability[] = [
	'agent:read',
	'agent:prompt',
	'storage:read',
	'storage:write',
	'net:fetch',
	'ui:render',
	'clipboard',
	'notify',
];

export interface CapabilityInfo {
	id: Capability;
	label: string;
	description: string;
	dangerous: boolean;
}

export const CAPABILITY_INFO: Record<Capability, CapabilityInfo> = {
	'agent:read': {
		id: 'agent:read',
		label: 'Read agent',
		description: 'Observe transcript, status, and diffs.',
		dangerous: false,
	},
	'agent:prompt': {
		id: 'agent:prompt',
		label: 'Drive agent',
		description: 'Send prompts and approve tool calls.',
		dangerous: true,
	},
	'storage:read': {
		id: 'storage:read',
		label: 'Read storage',
		description: 'Read its own sandboxed key/value store.',
		dangerous: false,
	},
	'storage:write': {
		id: 'storage:write',
		label: 'Write storage',
		description: 'Persist data in its own sandboxed store.',
		dangerous: false,
	},
	'net:fetch': {
		id: 'net:fetch',
		label: 'Network',
		description: 'Make outbound HTTP requests to allowed hosts.',
		dangerous: true,
	},
	'ui:render': {
		id: 'ui:render',
		label: 'Render UI',
		description: 'Emit native UI entities into its surface.',
		dangerous: false,
	},
	clipboard: {
		id: 'clipboard',
		label: 'Clipboard',
		description: 'Read and write the system clipboard.',
		dangerous: true,
	},
	notify: {
		id: 'notify',
		label: 'Notifications',
		description: 'Raise in-app toasts and notifications.',
		dangerous: false,
	},
};

export function isCapability(value: string): value is Capability {
	return (ALL_CAPABILITIES as readonly string[]).includes(value);
}

export function grantsCapability(
	granted: readonly Capability[],
	capability: Capability,
): boolean {
	return granted.includes(capability);
}

export function diffCapabilities(
	requested: readonly Capability[],
	granted: readonly Capability[],
): { missing: Capability[]; extra: Capability[] } {
	const grantedSet = new Set(granted);
	const requestedSet = new Set(requested);
	return {
		missing: requested.filter((c) => !grantedSet.has(c)),
		extra: granted.filter((c) => !requestedSet.has(c)),
	};
}
