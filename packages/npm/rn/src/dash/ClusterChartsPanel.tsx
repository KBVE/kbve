import { useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { Stack, Surface, Text, tokens } from './_ui';
import { TrendChart } from './TrendChart';
import type { ClusterHealth, NamespaceStat } from './clusterHealth';

function fmtBytes(v: number): string {
	if (v < 1024) return `${Math.round(v)} B/s`;
	if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB/s`;
	if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB/s`;
	return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtCount = (v: number) => `${Math.round(v)}`;

// Status palette (reserved): green healthy → amber warning → red critical. Every
// mark is paired with a text label/value, never color-alone. Track is a recessive
// surface; fills carry the status, values wear ink tokens.

function loadColor(pct: number | null): string {
	if (pct == null) return tokens.color.textFaint;
	if (pct >= 85) return tokens.color.danger;
	if (pct >= 65) return tokens.color.warning;
	return tokens.color.success;
}

function nsColor(ns: NamespaceStat): string {
	if (ns.failed) return tokens.color.danger;
	if (ns.pending || ns.restarts >= 5) return tokens.color.warning;
	return tokens.color.success;
}

/** One horizontal gauge: label · fill(0–100%) · value. Magnitude vs a 100% max. */
function Gauge({ label, pct }: { label: string; pct: number | null }) {
	const w = pct == null ? 0 : Math.max(0, Math.min(100, pct));
	return (
		<Stack direction="row" align="center" gap="sm">
			<Text variant="caption" tone="muted" style={styles.gaugeLabel}>
				{label}
			</Text>
			<View style={styles.track}>
				{w > 0 && (
					<View
						style={[
							styles.fill,
							{ width: `${w}%`, backgroundColor: loadColor(pct) },
						]}
					/>
				)}
			</View>
			<Text variant="caption" weight="medium" style={styles.gaugeValue}>
				{pct == null ? '—' : `${pct}%`}
			</Text>
		</Stack>
	);
}

/** Namespace magnitude bar: length ∝ pods, colored by worst health, direct-labeled. */
function NsBar({ ns, max }: { ns: NamespaceStat; max: number }) {
	const w = max > 0 ? Math.max(4, (ns.pods / max) * 100) : 0;
	return (
		<Stack direction="row" align="center" gap="sm">
			<Text
				variant="caption"
				tone="muted"
				numberOfLines={1}
				style={styles.nsLabel}>
				{ns.namespace}
			</Text>
			<View style={styles.nsTrackWrap}>
				<View
					style={[
						styles.fill,
						{ width: `${w}%`, backgroundColor: nsColor(ns) },
					]}
				/>
			</View>
			<Text variant="caption" weight="medium" style={styles.nsValue}>
				{ns.pods}
			</Text>
		</Stack>
	);
}

/** Pod composition: one stacked bar of running/pending/failed + labeled legend. */
function PodComposition({ h }: { h: ClusterHealth }) {
	const running = h.podsRunning ?? 0;
	const pending = h.podsPending ?? 0;
	const failed = h.podsFailed ?? 0;
	const total = running + pending + failed;
	if (total === 0) return null;
	const seg = (v: number) => `${(v / total) * 100}%`;
	return (
		<Stack gap="xs">
			<View style={styles.stack}>
				{running > 0 && (
					<View
						style={[
							styles.stackSeg,
							{
								width: seg(running),
								backgroundColor: tokens.color.success,
							},
						]}
					/>
				)}
				{pending > 0 && (
					<View
						style={[
							styles.stackSeg,
							{
								width: seg(pending),
								backgroundColor: tokens.color.warning,
							},
						]}
					/>
				)}
				{failed > 0 && (
					<View
						style={[
							styles.stackSeg,
							{
								width: seg(failed),
								backgroundColor: tokens.color.danger,
							},
						]}
					/>
				)}
			</View>
			<Stack direction="row" gap="md" wrap>
				<Legend
					color={tokens.color.success}
					label="Running"
					value={running}
				/>
				<Legend
					color={tokens.color.warning}
					label="Pending"
					value={pending}
				/>
				<Legend
					color={tokens.color.danger}
					label="Failed"
					value={failed}
				/>
			</Stack>
		</Stack>
	);
}

function Legend({
	color,
	label,
	value,
}: {
	color: string;
	label: string;
	value: number;
}) {
	return (
		<Stack direction="row" align="center" gap="xs">
			<View style={[styles.legendDot, { backgroundColor: color }]} />
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="caption" weight="medium">
				{value}
			</Text>
		</Stack>
	);
}

function SectionLabel({ children }: { children: string }) {
	return (
		<Text
			variant="caption"
			tone="faint"
			weight="medium"
			style={styles.section}>
			{children}
		</Text>
	);
}

/** Grafana-focused visual panel: cluster gauges → namespace bars → pod composition. */
export function ClusterChartsPanel({
	health,
}: {
	health: ClusterHealth | null;
}) {
	const [open, setOpen] = useState(true);
	if (!health) return null;

	const topNs = [...health.byNamespace]
		.sort((a, b) => b.pods - a.pods)
		.slice(0, 8);
	const maxPods = topNs.reduce((m, n) => Math.max(m, n.pods), 0);

	return (
		<Surface style={styles.panel}>
			<Pressable onPress={() => setOpen((v) => !v)}>
				<Stack direction="row" align="center" gap="sm">
					<Text variant="label">Cluster charts</Text>
					<View style={styles.spacer} />
					<Text variant="caption" tone="faint">
						{open ? '▼' : '▶'}
					</Text>
				</Stack>
			</Pressable>

			{open && (
				<Stack gap="md" style={styles.body}>
					{health.series && (
						<Stack gap="sm">
							<SectionLabel>TRENDS · 1h</SectionLabel>
							<Stack direction="row" gap="md" wrap>
								<TrendChart
									title="CPU"
									format={fmtPct}
									zeroFloor
									series={[
										{
											label: 'cpu',
											color: tokens.color.primary,
											points: health.series.cpu,
										},
									]}
								/>
								<TrendChart
									title="Memory"
									format={fmtPct}
									zeroFloor
									series={[
										{
											label: 'mem',
											color: tokens.color.success,
											points: health.series.mem,
										},
									]}
								/>
								<TrendChart
									title="Network"
									format={fmtBytes}
									zeroFloor
									series={[
										{
											label: 'rx',
											color: tokens.color.primary,
											points: health.series.netRx,
										},
										{
											label: 'tx',
											color: tokens.color.warning,
											points: health.series.netTx,
										},
									]}
								/>
								<TrendChart
									title="Pods running"
									format={fmtCount}
									series={[
										{
											label: 'pods',
											color: tokens.color.success,
											points: health.series.podsRunning,
										},
									]}
								/>
							</Stack>
						</Stack>
					)}

					<Stack gap="xs">
						<SectionLabel>CLUSTER LOAD</SectionLabel>
						<Gauge label="CPU" pct={health.cpuPercent} />
						<Gauge label="Memory" pct={health.memPercent} />
						<Gauge label="Disk" pct={health.diskPercent} />
					</Stack>

					{topNs.length > 0 && (
						<Stack gap="xs">
							<SectionLabel>PODS BY NAMESPACE</SectionLabel>
							{topNs.map((ns) => (
								<NsBar
									key={ns.namespace}
									ns={ns}
									max={maxPods}
								/>
							))}
						</Stack>
					)}

					<Stack gap="xs">
						<SectionLabel>POD STATUS</SectionLabel>
						<PodComposition h={health} />
					</Stack>
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
	section: {
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	spacer: { flexGrow: 1 },
	track: {
		flexGrow: 1,
		height: 8,
		borderRadius: 4,
		backgroundColor: tokens.color.surfaceAlt,
		overflow: 'hidden',
	},
	fill: { height: '100%', borderRadius: 4, minWidth: 3 },
	gaugeLabel: { width: 56 },
	gaugeValue: { width: 44, textAlign: 'right' },
	nsLabel: { width: 96 },
	nsTrackWrap: {
		flexGrow: 1,
		height: 8,
		borderRadius: 4,
		backgroundColor: tokens.color.surfaceAlt,
		overflow: 'hidden',
	},
	nsValue: { width: 32, textAlign: 'right' },
	stack: {
		flexDirection: 'row',
		height: 12,
		borderRadius: 6,
		overflow: 'hidden',
		backgroundColor: tokens.color.surfaceAlt,
		gap: 2,
	},
	stackSeg: { height: '100%' },
	legendDot: { width: 9, height: 9, borderRadius: 5 },
});
