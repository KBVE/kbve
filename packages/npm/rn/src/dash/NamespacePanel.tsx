import { useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from './_ui';
import type { BadgeTone } from './_ui';
import type { ClusterHealth, NamespaceStat } from './clusterHealth';

/** 0 = worst (failed) … 3 = healthy. Drives the unhealthy-first ordering. */
function severityRank(ns: NamespaceStat): number {
	if (ns.failed) return 0;
	if (ns.pending) return 1;
	if (ns.restarts >= 5) return 2;
	return 3;
}

function rowTone(ns: NamespaceStat): BadgeTone {
	if (ns.failed) return 'danger';
	if (ns.pending) return 'warning';
	if (ns.restarts >= 5) return 'warning';
	return 'success';
}

const pillBg = StyleSheet.create({
	neutral: { backgroundColor: tokens.color.surfaceAlt },
	success: { backgroundColor: '#0e2a1a' },
	danger: { backgroundColor: '#2a0e12' },
	warning: { backgroundColor: '#2a210e' },
});

const pillText = StyleSheet.create({
	neutral: { color: tokens.color.textMuted },
	success: { color: tokens.color.success },
	danger: { color: tokens.color.danger },
	warning: { color: tokens.color.warning },
});

type PillTone = 'neutral' | 'success' | 'danger' | 'warning';

function Pill({ label, tone }: { label: string; tone: PillTone }) {
	return (
		<View style={[styles.pill, pillBg[tone]]}>
			<Text variant="caption" weight="medium" style={pillText[tone]}>
				{label}
			</Text>
		</View>
	);
}

function NamespaceRow({ ns }: { ns: NamespaceStat }) {
	return (
		<Surface padded={false} style={styles.row}>
			<View
				style={[styles.dot, { backgroundColor: dotColor(rowTone(ns)) }]}
			/>
			<Text variant="caption" numberOfLines={1} style={styles.name}>
				{ns.namespace}
			</Text>
			<View style={styles.spacer} />
			<Stack direction="row" gap="xs" align="center">
				<Pill
					label={`${ns.running}/${ns.pods}`}
					tone={ns.running < ns.pods ? 'warning' : 'success'}
				/>
				{ns.pending ? (
					<Pill label={`${ns.pending} pend`} tone="warning" />
				) : null}
				{ns.failed ? (
					<Pill label={`${ns.failed} fail`} tone="danger" />
				) : null}
				{ns.restarts ? (
					<Pill label={`↻ ${ns.restarts}`} tone="neutral" />
				) : null}
			</Stack>
		</Surface>
	);
}

function dotColor(tone: BadgeTone): string {
	if (tone === 'danger') return tokens.color.danger;
	if (tone === 'warning') return tokens.color.warning;
	if (tone === 'success') return tokens.color.success;
	return tokens.color.textFaint;
}

/** Collapsible per-namespace pod/health table sourced from cluster-health meta. */
export function NamespacePanel({ health }: { health: ClusterHealth | null }) {
	const [open, setOpen] = useState(false);
	const list = health?.byNamespace ?? [];
	if (list.length === 0) return null;

	// Unhealthy namespaces float to the top; ties broken by failed/pending/pods.
	const sorted = [...list].sort(
		(a, b) =>
			severityRank(a) - severityRank(b) ||
			b.failed - a.failed ||
			b.pending - a.pending ||
			b.pods - a.pods,
	);
	const unhealthy = list.filter((n) => n.failed || n.pending).length;

	return (
		<Surface style={styles.panel}>
			<Pressable onPress={() => setOpen((v) => !v)}>
				<Stack direction="row" align="center" gap="sm">
					<Text variant="label">Namespaces</Text>
					<Badge label={String(list.length)} tone="neutral" />
					{unhealthy > 0 && (
						<Badge label={`${unhealthy} degraded`} tone="warning" />
					)}
					<View style={styles.spacer} />
					<Text variant="caption" tone="faint">
						{open ? '▼' : '▶'}
					</Text>
				</Stack>
			</Pressable>
			{open && (
				<Stack gap="xs" style={styles.body}>
					{sorted.map((ns) => (
						<NamespaceRow key={ns.namespace} ns={ns} />
					))}
				</Stack>
			)}
		</Surface>
	);
}

const styles = StyleSheet.create({
	panel: { padding: tokens.space.md },
	body: {
		marginTop: tokens.space.sm,
		paddingTop: tokens.space.sm,
		borderTopWidth: 1,
		borderTopColor: tokens.color.border,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingVertical: 5,
	},
	name: { flexShrink: 1 },
	spacer: { flexGrow: 1 },
	dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
	pill: {
		paddingHorizontal: 9,
		paddingVertical: 3,
		borderRadius: tokens.radius.pill,
		minWidth: 46,
		alignItems: 'center',
	},
});
