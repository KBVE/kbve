import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import { createStreamSource } from '../createStreamSource';
import type { StatModel, StreamLens, StreamStore } from '../types';

export interface RawLonghornReplica {
	name?: string;
	mode?: string;
	running?: boolean;
	hostId?: string;
	diskPath?: string;
	failedAt?: string;
}

export interface RawLonghornVolume {
	name: string;
	size?: string;
	state?: string;
	robustness?: string;
	created?: string;
	numberOfReplicas?: number;
	kubernetesStatus?: {
		namespace?: string;
		pvcName?: string;
		pvName?: string;
		workloadsStatus?:
			| { podName?: string; workloadName?: string; workloadType?: string }[]
			| null;
	};
	replicas?: RawLonghornReplica[] | null;
	controllers?: { actualSize?: string; hostId?: string }[] | null;
}

export interface RawLonghornDisk {
	path?: string;
	storageMaximum?: number;
	storageAvailable?: number;
	storageScheduled?: number;
	storageReserved?: number;
}

export interface RawLonghornNode {
	name?: string;
	id?: string;
	disks?: Record<string, RawLonghornDisk> | null;
}

export interface LonghornVolumeItem {
	name: string;
	claim: string;
	state: string;
	robustness: string;
	sizeBytes: number;
	actualSizeBytes: number;
	node: string;
	diskLabel: string;
	specReplicas: number;
	replicaCount: number;
	failedReplicas: number;
	created?: string;
	workloads: string;
}

export interface DiskSummary {
	node: string;
	name: string;
	label: string;
	path: string;
	maxBytes: number;
	availableBytes: number;
	scheduledBytes: number;
	reservedBytes: number;
}

export interface LonghornStreamOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	pollMs?: number;
}

export function formatBytesBin(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
	if (bytes < 1024) return `${bytes} B`;
	const kib = bytes / 1024;
	if (kib < 1024) return `${kib.toFixed(1)} KiB`;
	const mib = kib / 1024;
	if (mib < 1024) return `${mib.toFixed(1)} MiB`;
	const gib = mib / 1024;
	if (gib < 1024) return `${gib.toFixed(1)} GiB`;
	return `${(gib / 1024).toFixed(2)} TiB`;
}

export function diskLabelFromPath(path: string | undefined): string {
	if (!path) return 'unknown';
	if (path === '/var/lib/longhorn') return 'sda';
	const match = path.match(/longhorn-([a-z0-9]+)/);
	if (match) return match[1];
	const segments = path.split('/').filter(Boolean);
	return segments[segments.length - 1] ?? path;
}

export function normalizeVolume(raw: RawLonghornVolume): LonghornVolumeItem {
	const ks = raw.kubernetesStatus;
	const claim =
		ks?.namespace && ks?.pvcName ? `${ks.namespace}/${ks.pvcName}` : raw.name;
	const replicas = raw.replicas ?? [];
	const activeReplica = replicas.find((r) => r.running && r.diskPath);
	const failedReplicas = replicas.filter((r) => r.failedAt).length;
	const controller = raw.controllers?.[0];
	const workloads = (ks?.workloadsStatus ?? [])
		.map((w) => w.workloadName || w.podName || '')
		.filter(Boolean)
		.join(', ');

	return {
		name: raw.name,
		claim,
		state: raw.state ?? 'unknown',
		robustness: raw.robustness ?? 'unknown',
		sizeBytes: Number(raw.size ?? 0),
		actualSizeBytes: Number(controller?.actualSize ?? 0),
		node:
			controller?.hostId ??
			activeReplica?.hostId ??
			replicas[0]?.hostId ??
			'—',
		diskLabel: diskLabelFromPath(
			activeReplica?.diskPath ?? replicas[0]?.diskPath,
		),
		specReplicas: raw.numberOfReplicas ?? 0,
		replicaCount: replicas.length,
		failedReplicas,
		created: raw.created,
		workloads,
	};
}

export function summarizeDisks(nodes: RawLonghornNode[]): DiskSummary[] {
	const out: DiskSummary[] = [];
	for (const node of nodes) {
		const disks = node.disks ?? {};
		for (const [name, disk] of Object.entries(disks)) {
			out.push({
				node: node.name ?? node.id ?? '—',
				name,
				label: diskLabelFromPath(disk.path),
				path: disk.path ?? '—',
				maxBytes: disk.storageMaximum ?? 0,
				availableBytes: disk.storageAvailable ?? 0,
				scheduledBytes: disk.storageScheduled ?? 0,
				reservedBytes: disk.storageReserved ?? 0,
			});
		}
	}
	return out.sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchCollection<T>(
	url: string,
	token: string | null,
	signal?: AbortSignal,
): Promise<T[]> {
	const res = await fetch(url, {
		headers: token ? { Authorization: `Bearer ${token}` } : undefined,
		signal,
	});
	if (res.status === 403) throw new Error('Access restricted');
	if (res.status === 503) throw new Error('Longhorn proxy not configured');
	if (!res.ok) throw new Error(`Longhorn error: ${res.status}`);
	const json = (await res.json()) as { data?: T[] };
	return Array.isArray(json?.data) ? json.data : [];
}

export function createLonghornStream(
	opts: LonghornStreamOptions,
): StreamStore<LonghornVolumeItem> {
	const { getToken, baseUrl = '', pollMs = 30_000 } = opts;

	return createStreamSource<RawLonghornVolume, LonghornVolumeItem>({
		key: 'longhorn:volumes',
		pollMs,
		cacheTtlMs: 30_000,
		id: (it) => it.name,
		signature: (it) =>
			`${it.state}|${it.robustness}|${it.actualSizeBytes}|${it.node}|${it.replicaCount}|${it.failedReplicas}`,
		normalize: normalizeVolume,
		fetch: async ({ signal }) => {
			const token = await getToken();
			const volumes = await fetchCollection<RawLonghornVolume>(
				`${baseUrl}/dashboard/storage/proxy/volumes`,
				token,
				signal,
			);
			return volumes.sort((a, b) => a.name.localeCompare(b.name));
		},
		fetchMeta: async ({ signal }) => {
			try {
				const token = await getToken();
				const nodes = await fetchCollection<RawLonghornNode>(
					`${baseUrl}/dashboard/storage/proxy/nodes`,
					token,
					signal,
				);
				return summarizeDisks(nodes);
			} catch {
				return null;
			}
		},
	});
}

export type VolumeHealth = 'healthy' | 'degraded' | 'detached' | 'faulted';

export function volumeHealth(it: LonghornVolumeItem): VolumeHealth {
	if (it.robustness === 'faulted') return 'faulted';
	if (it.state === 'detached') return 'detached';
	if (it.robustness === 'healthy' && it.failedReplicas === 0) return 'healthy';
	return 'degraded';
}

function healthTone(health: VolumeHealth): BadgeTone {
	if (health === 'healthy') return 'success';
	if (health === 'detached') return 'neutral';
	if (health === 'degraded') return 'warning';
	return 'danger';
}

function healthColor(health: VolumeHealth): string {
	if (health === 'healthy') return tokens.color.success;
	if (health === 'detached') return tokens.color.textFaint;
	if (health === 'degraded') return tokens.color.warning;
	return tokens.color.danger;
}

function diskTone(disk: DiskSummary): BadgeTone | undefined {
	if (disk.maxBytes <= 0) return undefined;
	if (disk.scheduledBytes > disk.maxBytes) return 'danger';
	if (disk.availableBytes < disk.maxBytes * 0.15) return 'warning';
	return 'success';
}

export const longhornLens: StreamLens<LonghornVolumeItem> = {
	searchText: (it) =>
		`${it.name} ${it.claim} ${it.state} ${it.robustness} ${it.diskLabel} ${it.node} ${it.workloads}`,
	group: (it) => `Disk: ${it.diskLabel}`,
	filters: [
		{
			id: 'healthy',
			label: 'Healthy',
			tone: 'success',
			predicate: (it) => volumeHealth(it) === 'healthy',
		},
		{
			id: 'degraded',
			label: 'Degraded',
			tone: 'warning',
			predicate: (it) =>
				volumeHealth(it) === 'degraded' || volumeHealth(it) === 'faulted',
		},
		{
			id: 'detached',
			label: 'Detached',
			tone: 'neutral',
			predicate: (it) => volumeHealth(it) === 'detached',
		},
		{
			id: 'stale',
			label: 'Stale Replicas',
			tone: 'danger',
			predicate: (it) => it.failedReplicas > 0,
		},
	],
	stats: (items, meta) => {
		const out: StatModel[] = [
			{ id: 'total', label: 'Volumes', value: items.length },
			{
				id: 'healthy',
				label: 'Healthy',
				tone: 'success',
				value: items.filter((i) => volumeHealth(i) === 'healthy').length,
			},
			{
				id: 'detached',
				label: 'Detached',
				value: items.filter((i) => volumeHealth(i) === 'detached').length,
			},
			{
				id: 'provisioned',
				label: 'Provisioned',
				value: formatBytesBin(
					items.reduce((sum, i) => sum + i.sizeBytes, 0),
				),
			},
			{
				id: 'used',
				label: 'Used',
				value: formatBytesBin(
					items.reduce((sum, i) => sum + i.actualSizeBytes, 0),
				),
			},
		];
		const disks = (meta as DiskSummary[] | null) ?? [];
		for (const disk of disks) {
			const pct =
				disk.maxBytes > 0
					? Math.round((disk.scheduledBytes / disk.maxBytes) * 100)
					: 0;
			out.push({
				id: `disk_${disk.label}`,
				label: `${disk.label} scheduled`,
				tone: diskTone(disk),
				value: `${pct}%`,
			});
			out.push({
				id: `disk_${disk.label}_free`,
				label: `${disk.label} free`,
				tone: diskTone(disk),
				value: formatBytesBin(disk.availableBytes),
			});
		}
		return out;
	},
	metaPanel: (meta) => {
		const disks = (meta as DiskSummary[] | null) ?? [];
		if (disks.length === 0) return null;
		return (
			<Surface style={styles.card}>
				<Stack gap="sm">
					<Text variant="label">Disks</Text>
					{disks.map((disk) => (
						<Stack key={`${disk.node}/${disk.name}`} gap="xs">
							<Stack direction="row" align="center" gap="xs" wrap>
								<Text variant="label">{disk.label}</Text>
								<Badge
									label={`${formatBytesBin(disk.scheduledBytes)} / ${formatBytesBin(disk.maxBytes)} scheduled`}
									tone={diskTone(disk)}
								/>
							</Stack>
							<Text variant="caption" tone="faint">
								{disk.node} · {disk.path} ·{' '}
								{formatBytesBin(disk.availableBytes)} free ·{' '}
								{formatBytesBin(disk.reservedBytes)} reserved
							</Text>
						</Stack>
					))}
				</Stack>
			</Surface>
		);
	},
	row: (it) => {
		const health = volumeHealth(it);
		return (
			<Surface padded={false} style={styles.row}>
				<View
					style={[
						styles.statusDot,
						{ backgroundColor: healthColor(health) },
					]}
				/>
				<Stack gap="xs" style={styles.rowContent}>
					<Stack direction="row" align="center" gap="xs" wrap>
						<Text variant="label" numberOfLines={1} style={styles.name}>
							{it.claim}
						</Text>
						<Badge label={health.toUpperCase()} tone={healthTone(health)} />
						{it.failedReplicas > 0 && (
							<Badge
								label={`${it.failedReplicas} STALE`}
								tone="danger"
							/>
						)}
					</Stack>
					<Text variant="caption" tone="faint" numberOfLines={1}>
						{formatBytesBin(it.sizeBytes)}
						{it.actualSizeBytes > 0
							? ` · ${formatBytesBin(it.actualSizeBytes)} used`
							: ''}{' '}
						· {it.diskLabel} · {it.node}
					</Text>
				</Stack>
			</Surface>
		);
	},
	card: (it) => {
		const health = volumeHealth(it);
		return (
			<Surface style={styles.card}>
				<Stack gap="sm">
					<Stack direction="row" align="center" gap="xs">
						<View
							style={[
								styles.statusDot,
								{ backgroundColor: healthColor(health) },
							]}
						/>
						<Text variant="label" numberOfLines={1} style={styles.name}>
							{it.claim}
						</Text>
					</Stack>
					<Stack direction="row" gap="sm" wrap>
						<Badge label={health.toUpperCase()} tone={healthTone(health)} />
						<Badge label={it.diskLabel} tone="primary" />
					</Stack>
					<Text variant="caption" tone="faint">
						{formatBytesBin(it.sizeBytes)}
						{it.actualSizeBytes > 0
							? ` · ${formatBytesBin(it.actualSizeBytes)} used`
							: ''}
					</Text>
				</Stack>
			</Surface>
		);
	},
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Volume" value={it.name} />
			<Fact label="Claim" value={it.claim} />
			<Fact label="State" value={it.state} />
			<Fact label="Robustness" value={it.robustness} />
			<Fact label="Provisioned" value={formatBytesBin(it.sizeBytes)} />
			{it.actualSizeBytes > 0 && (
				<Fact label="Used" value={formatBytesBin(it.actualSizeBytes)} />
			)}
			<Fact label="Disk" value={it.diskLabel} />
			<Fact label="Node" value={it.node} />
			<Fact
				label="Replicas"
				value={`${it.replicaCount} (${it.specReplicas} desired)`}
			/>
			{it.failedReplicas > 0 && (
				<Fact label="Stale Replicas" value={String(it.failedReplicas)} />
			)}
			{it.workloads !== '' && <Fact label="Workloads" value={it.workloads} />}
			{it.created && (
				<Fact
					label="Created"
					value={new Date(it.created).toLocaleString()}
				/>
			)}
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
