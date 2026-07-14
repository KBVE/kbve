import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeploymentVisibility = 'staff' | 'public';
export type DeploymentDestroyReason =
	| 'user'
	| 'idle_sweep'
	| 'crash'
	| 'pod_shutdown'
	| 'admin';

interface RawDeployment {
	id: number;
	vm_id: string;
	account_id: string;
	rootfs: string;
	entrypoint: string;
	http_port: number;
	visibility: DeploymentVisibility;
	vcpu_count: number;
	mem_size_mib: number;
	idle_ttl_secs: number;
	spec: Record<string, unknown>;
	created_at: string;
	destroyed_at: string | null;
	destroy_reason: DeploymentDestroyReason | null;
	settled_ledger_id: number | null;
	credits_spent: number | null;
}

export interface DeploymentItem {
	id: string;
	vmId: string;
	rootfs: string;
	entrypoint: string;
	visibility: DeploymentVisibility;
	vcpuCount: number;
	memSizeMib: number;
	createdAt: string;
	destroyedAt: string | null;
	destroyReason: DeploymentDestroyReason | null;
	creditsSpent: number | null;
	isLive: boolean;
	age: string;
}

export interface DeploymentStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
	/** Only show live deployments */
	liveOnly?: boolean;
	limit?: number;
	offset?: number;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalize(raw: RawDeployment): DeploymentItem {
	const isLive = !raw.destroyed_at;
	const age = formatAge(raw.created_at);

	return {
		id: String(raw.id),
		vmId: raw.vm_id,
		rootfs: raw.rootfs,
		entrypoint: raw.entrypoint,
		visibility: raw.visibility,
		vcpuCount: raw.vcpu_count,
		memSizeMib: raw.mem_size_mib,
		createdAt: raw.created_at,
		destroyedAt: raw.destroyed_at,
		destroyReason: raw.destroy_reason,
		creditsSpent: raw.credits_spent,
		isLive,
		age,
	};
}

function formatAge(createdAt: string): string {
	try {
		const created = new Date(createdAt).getTime();
		const diffSec = Math.max(0, Math.round((Date.now() - created) / 1000));
		if (diffSec < 60) return `${diffSec}s`;
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h`;
		return `${Math.round(diffHr / 24)}d`;
	} catch {
		return '—';
	}
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createDeploymentStream(
	opts: DeploymentStreamOptions,
): StreamStore<DeploymentItem> {
	const {
		getToken,
		baseUrl = '',
		pollMs = 30_000,
		liveOnly = false,
		limit = 25,
		offset = 0,
	} = opts;

	return createStreamSource<RawDeployment, DeploymentItem>({
		key: `deployment:history:${liveOnly ? 'live' : 'all'}`,
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) => `${it.isLive}|${it.destroyedAt}|${it.creditsSpent}`,
		normalize,
		fetch: async ({ signal }) => {
			const token = await getToken();
			const params = new URLSearchParams({
				limit: String(limit),
				offset: String(offset),
				live_only: liveOnly ? 'true' : 'false',
			});

			const res = await fetch(
				`${baseUrl}/dashboard/firecracker/deployments?${params.toString()}`,
				{
					headers: token
						? { Authorization: `Bearer ${token}` }
						: undefined,
					signal,
				},
			);

			if (res.status === 403) throw new Error('Access restricted');
			if (!res.ok) throw new Error(`Deployment API error: ${res.status}`);

			const json = (await res.json()) as {
				deployments?: RawDeployment[];
			};
			const raw = json?.deployments ?? [];

			// Sort by created_at descending (newest first)
			return raw.sort((a, b) => {
				const tA = new Date(a.created_at).getTime();
				const tB = new Date(b.created_at).getTime();
				return tB - tA;
			});
		},
	});
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function statusTone(isLive: boolean): BadgeTone {
	return isLive ? 'success' : 'neutral';
}

function visibilityTone(visibility: DeploymentVisibility): BadgeTone {
	return visibility === 'public' ? 'primary' : 'neutral';
}

function statusColor(isLive: boolean): string {
	return isLive ? tokens.color.success : tokens.color.textFaint;
}

export const deploymentLens: StreamLens<DeploymentItem> = {
	searchText: (it) => `${it.vmId} ${it.rootfs} ${it.entrypoint}`,
	group: (it) => (it.isLive ? 'Live' : 'Destroyed'),
	filters: [
		{
			id: 'live',
			label: 'Live',
			tone: 'success',
			predicate: (it) => it.isLive,
		},
		{
			id: 'destroyed',
			label: 'Destroyed',
			tone: 'neutral',
			predicate: (it) => !it.isLive,
		},
		{
			id: 'public',
			label: 'Public',
			tone: 'primary',
			predicate: (it) => it.visibility === 'public',
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Total', value: items.length },
		{
			id: 'live',
			label: 'Live',
			tone: 'success',
			value: items.filter((i) => i.isLive).length,
		},
		{
			id: 'destroyed',
			label: 'Destroyed',
			tone: 'neutral',
			value: items.filter((i) => !i.isLive).length,
		},
		{
			id: 'credits',
			label: 'Credits Spent',
			value: items.reduce((sum, i) => sum + (i.creditsSpent ?? 0), 0),
		},
	],
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.statusDot,
					{ backgroundColor: statusColor(it.isLive) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.vmId}>
						{it.vmId}
					</Text>
					<Badge
						label={it.isLive ? 'Live' : 'Destroyed'}
						tone={statusTone(it.isLive)}
					/>
					<Badge
						label={it.visibility}
						tone={visibilityTone(it.visibility)}
					/>
				</Stack>
				<Text variant="caption" tone="muted" numberOfLines={1}>
					{it.rootfs}
				</Text>
				<Text variant="caption" tone="faint">
					{it.vcpuCount} vCPU · {it.memSizeMib} MiB · {it.age} old
				</Text>
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
							{ backgroundColor: statusColor(it.isLive) },
						]}
					/>
					<Text variant="label" numberOfLines={1} style={styles.vmId}>
						{it.vmId}
					</Text>
				</Stack>
				<Text variant="caption" tone="muted" numberOfLines={1}>
					{it.rootfs}
				</Text>
				<Stack direction="row" gap="sm" wrap>
					<Badge
						label={it.isLive ? 'Live' : 'Destroyed'}
						tone={statusTone(it.isLive)}
					/>
					<Badge
						label={it.visibility}
						tone={visibilityTone(it.visibility)}
					/>
				</Stack>
				<Text variant="caption" tone="faint">
					{it.vcpuCount} vCPU · {it.memSizeMib} MiB · {it.age} old
				</Text>
				{it.creditsSpent !== null && (
					<Text variant="caption" tone="faint">
						{it.creditsSpent.toFixed(2)} credits
					</Text>
				)}
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="VM ID" value={it.vmId} />
			<Fact label="Status" value={it.isLive ? 'LIVE' : 'DESTROYED'} />
			<Fact label="Visibility" value={it.visibility.toUpperCase()} />
			<Fact label="Rootfs" value={it.rootfs} />
			<Fact label="Entrypoint" value={it.entrypoint} />
			<Fact label="vCPU" value={String(it.vcpuCount)} />
			<Fact label="Memory" value={`${it.memSizeMib} MiB`} />
			<Fact label="Age" value={it.age} />
			<Fact
				label="Created"
				value={new Date(it.createdAt).toLocaleString()}
			/>
			{it.destroyedAt && (
				<Fact
					label="Destroyed"
					value={new Date(it.destroyedAt).toLocaleString()}
				/>
			)}
			{it.destroyReason && (
				<Fact label="Destroy Reason" value={it.destroyReason} />
			)}
			{it.creditsSpent !== null && (
				<Fact
					label="Credits Spent"
					value={it.creditsSpent.toFixed(2)}
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
	vmId: {
		flexShrink: 1,
	},
	factValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});
