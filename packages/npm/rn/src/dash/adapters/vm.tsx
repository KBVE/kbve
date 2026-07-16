import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VMPhase =
	| 'Running'
	| 'Stopped'
	| 'Starting'
	| 'Stopping'
	| 'Paused'
	| 'Migrating'
	| 'Unknown';

interface RawVM {
	metadata: {
		name: string;
		namespace: string;
		creationTimestamp: string;
		labels?: Record<string, string>;
	};
	spec: {
		running?: boolean;
		runStrategy?: string;
		template: {
			spec: {
				domain: {
					cpu?: {
						cores?: number;
						sockets?: number;
						threads?: number;
					};
					resources?: { requests?: { memory?: string } };
					memory?: { guest?: string };
				};
			};
		};
	};
	status?: {
		printableStatus?: string;
		ready?: boolean;
	};
}

interface RawVMI {
	metadata: { name: string; creationTimestamp: string };
	status: {
		phase: VMPhase;
		nodeName?: string;
		interfaces?: Array<{ ipAddress?: string }>;
	};
}

export interface VMItem {
	id: string;
	name: string;
	namespace: string;
	phase: VMPhase;
	osType: 'windows' | 'macos' | 'linux' | 'unknown';
	cpuCores: number;
	memory: string;
	ipAddress: string;
	nodeName: string;
	uptimeMinutes?: number;
	runnerLabel?: string;
	isKedaManaged: boolean;
	mayHaveActiveJob: boolean;
	createdAt: string;
}

export interface VMStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
	/** KubeVirt namespace */
	namespace?: string;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function detectOS(vm: RawVM): VMItem['osType'] {
	const name = vm.metadata.name.toLowerCase();
	const labels = vm.metadata.labels ?? {};
	const osLabel = (
		labels['os'] ??
		labels['kubevirt.io/os'] ??
		''
	).toLowerCase();

	if (
		name.includes('windows') ||
		name.includes('win') ||
		osLabel === 'windows'
	)
		return 'windows';
	if (name.includes('mac') || name.includes('darwin') || osLabel === 'macos')
		return 'macos';
	if (name.includes('linux') || osLabel === 'linux') return 'linux';
	return 'unknown';
}

function getPhase(vm: RawVM, vmi?: RawVMI): VMPhase {
	if (vmi) return vmi.status.phase;
	const status = vm.status?.printableStatus ?? '';
	if (status) return status as VMPhase;
	if (vm.spec.running === false) return 'Stopped';
	return 'Unknown';
}

function normalize(vm: RawVM, vmis: RawVMI[]): VMItem {
	const vmi = vmis.find((i) => i.metadata.name === vm.metadata.name);
	const phase = getPhase(vm, vmi);

	const cpu = vm.spec.template.spec.domain.cpu;
	const cpuCores =
		(cpu?.cores ?? 1) * (cpu?.sockets ?? 1) * (cpu?.threads ?? 1);
	const memory =
		vm.spec.template.spec.domain.memory?.guest ??
		vm.spec.template.spec.domain.resources?.requests?.memory ??
		'?';

	const ipAddress = vmi?.status.interfaces?.[0]?.ipAddress ?? '';
	const nodeName = vmi?.status.nodeName ?? '';

	const labels = vm.metadata.labels ?? {};
	const runnerLabel =
		labels['runner'] ??
		labels['github-actions-runner'] ??
		labels['actions-runner'] ??
		undefined;
	const isKedaManaged = !!runnerLabel;

	let uptimeMinutes: number | undefined;
	if (vmi?.metadata.creationTimestamp && phase === 'Running') {
		const created = new Date(vmi.metadata.creationTimestamp).getTime();
		uptimeMinutes = Math.floor((Date.now() - created) / 60000);
	}

	const mayHaveActiveJob =
		isKedaManaged &&
		phase === 'Running' &&
		uptimeMinutes !== undefined &&
		uptimeMinutes < 30;

	return {
		id: vm.metadata.name,
		name: vm.metadata.name,
		namespace: vm.metadata.namespace,
		phase,
		osType: detectOS(vm),
		cpuCores,
		memory,
		ipAddress,
		nodeName,
		uptimeMinutes,
		runnerLabel,
		isKedaManaged,
		mayHaveActiveJob,
		createdAt: vm.metadata.creationTimestamp,
	};
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createVMStream(opts: VMStreamOptions): StreamStore<VMItem> {
	const {
		getToken,
		baseUrl = '',
		pollMs = 15_000,
		namespace = 'angelscript',
	} = opts;

	return createStreamSource<VMItem, VMItem>({
		key: `vm:${namespace}`,
		pollMs,
		cacheTtlMs: 30_000,
		id: (it) => it.id,
		signature: (it) =>
			`${it.phase}|${it.ipAddress}|${it.nodeName}|${it.uptimeMinutes}`,
		normalize: (x) => x as VMItem, // Normalized in fetch
		fetch: async ({ signal }) => {
			const token = await getToken();
			const [vmsRes, vmisRes] = await Promise.all([
				fetch(
					`${baseUrl}/dashboard/vm/proxy/apis/kubevirt.io/v1/namespaces/${namespace}/virtualmachines`,
					{
						headers: token
							? { Authorization: `Bearer ${token}` }
							: undefined,
						signal,
					},
				),
				fetch(
					`${baseUrl}/dashboard/vm/proxy/apis/kubevirt.io/v1/namespaces/${namespace}/virtualmachineinstances`,
					{
						headers: token
							? { Authorization: `Bearer ${token}` }
							: undefined,
						signal,
					},
				),
			]);

			if (vmsRes.status === 403 || vmisRes.status === 403)
				throw new Error('Access restricted');
			if (!vmsRes.ok || !vmisRes.ok) throw new Error('VM API error');

			const vmsJson = (await vmsRes.json()) as { items: RawVM[] };
			const vmisJson = (await vmisRes.json()) as { items: RawVMI[] };

			const vms = vmsJson.items ?? [];
			const vmis = vmisJson.items ?? [];

			return vms.map((vm) => normalize(vm, vmis));
		},
	});
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function phaseTone(phase: VMPhase): BadgeTone {
	if (phase === 'Running') return 'success';
	if (phase === 'Stopped') return 'neutral';
	if (phase === 'Starting' || phase === 'Migrating') return 'warning';
	if (phase === 'Stopping') return 'danger';
	return 'neutral';
}

function phaseColor(phase: VMPhase): string {
	if (phase === 'Running') return tokens.color.success;
	if (phase === 'Stopped') return tokens.color.textFaint;
	if (phase === 'Starting' || phase === 'Migrating')
		return tokens.color.warning;
	if (phase === 'Stopping') return tokens.color.danger;
	return tokens.color.textFaint;
}

export const vmLens: StreamLens<VMItem> = {
	searchText: (it) => `${it.name} ${it.osType} ${it.runnerLabel ?? ''}`,
	group: (it) => it.phase,
	filters: [
		{
			id: 'running',
			label: 'Running',
			tone: 'success',
			predicate: (it) => it.phase === 'Running',
		},
		{
			id: 'stopped',
			label: 'Stopped',
			tone: 'neutral',
			predicate: (it) => it.phase === 'Stopped',
		},
		{
			id: 'keda',
			label: 'KEDA Managed',
			tone: 'primary',
			predicate: (it) => it.isKedaManaged,
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Total VMs', value: items.length },
		{
			id: 'running',
			label: 'Running',
			tone: 'success',
			value: items.filter((i) => i.phase === 'Running').length,
		},
		{
			id: 'keda',
			label: 'KEDA Managed',
			tone: 'primary',
			value: items.filter((i) => i.isKedaManaged).length,
		},
	],
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.statusDot,
					{ backgroundColor: phaseColor(it.phase) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.name}
					</Text>
					<Badge label={it.phase} tone={phaseTone(it.phase)} />
					{it.isKedaManaged && <Badge label="KEDA" tone="primary" />}
				</Stack>
				<Text variant="caption" tone="muted">
					{it.osType} · {it.cpuCores} vCPU · {it.memory}
				</Text>
				{it.ipAddress && (
					<Text variant="caption" tone="faint">
						{it.ipAddress}
						{it.nodeName ? ` @ ${it.nodeName}` : ''}
					</Text>
				)}
				{it.uptimeMinutes !== undefined && (
					<Text variant="caption" tone="faint">
						Uptime: {it.uptimeMinutes}m
						{it.mayHaveActiveJob ? ' (active job?)' : ''}
					</Text>
				)}
			</Stack>
		</Surface>
	),
	card: (it) => (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Stack direction="row" align="center" gap="xs">
					<View
						style={[
							styles.statusDot,
							{ backgroundColor: phaseColor(it.phase) },
						]}
					/>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.name}
					</Text>
				</Stack>
				<Stack direction="row" gap="sm" wrap>
					<Badge label={it.phase} tone={phaseTone(it.phase)} />
					<Badge label={it.osType.toUpperCase()} tone="neutral" />
					{it.isKedaManaged && <Badge label="KEDA" tone="primary" />}
				</Stack>
				<Text variant="caption" tone="faint">
					{it.cpuCores} vCPU · {it.memory}
				</Text>
				{it.ipAddress && (
					<Text variant="caption" tone="faint">
						IP: {it.ipAddress}
					</Text>
				)}
				{it.nodeName && (
					<Text variant="caption" tone="faint">
						Node: {it.nodeName}
					</Text>
				)}
				{it.uptimeMinutes !== undefined && (
					<Text variant="caption" tone="faint">
						Uptime: {it.uptimeMinutes}m
						{it.mayHaveActiveJob ? ' (active job likely)' : ''}
					</Text>
				)}
				{it.runnerLabel && (
					<Text variant="caption" tone="faint">
						Runner: {it.runnerLabel}
					</Text>
				)}
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Name" value={it.name} />
			<Fact label="Namespace" value={it.namespace} />
			<Fact label="Phase" value={it.phase.toUpperCase()} />
			<Fact label="OS Type" value={it.osType.toUpperCase()} />
			<Fact label="vCPU Cores" value={String(it.cpuCores)} />
			<Fact label="Memory" value={it.memory} />
			{it.ipAddress && <Fact label="IP Address" value={it.ipAddress} />}
			{it.nodeName && <Fact label="Node" value={it.nodeName} />}
			{it.uptimeMinutes !== undefined && (
				<Fact label="Uptime" value={`${it.uptimeMinutes} minutes`} />
			)}
			{it.runnerLabel && (
				<Fact label="Runner Label" value={it.runnerLabel} />
			)}
			{it.isKedaManaged && <Fact label="KEDA Managed" value="YES" />}
			{it.mayHaveActiveJob && (
				<Fact label="Active Job" value="LIKELY (uptime < 30m)" />
			)}
			<Fact
				label="Created"
				value={new Date(it.createdAt).toLocaleString()}
			/>
		</Stack>
	),
};

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<Stack direction="row" gap="sm" justify="space-between">
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="caption" numberOfLines={1} style={styles.factValue}>
				{value}
			</Text>
		</Stack>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
	},
	rowContent: {
		flexShrink: 1,
		flexGrow: 1,
	},
	card: {
		padding: tokens.space.md,
	},
	statusDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		flexShrink: 0,
	},
	name: {
		flexShrink: 1,
	},
	factValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});
