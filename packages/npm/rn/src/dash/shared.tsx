import { StyleSheet, View } from 'react-native';
import { Stack, Text, tokens } from './_ui';
import type { BadgeTone } from './_ui';

// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------

/** Hairline divider with a small uppercase section label — visual break between dashboard sections */
export function SectionDivider({ label }: { label?: string }) {
	if (!label) return <View style={styles.dividerLine} />;
	return (
		<Stack direction="row" gap="sm" align="center" style={styles.divider}>
			<View style={styles.dividerLine} />
			<Text variant="caption" tone="faint" style={styles.dividerLabel}>
				{label}
			</Text>
			<View style={styles.dividerLine} />
		</Stack>
	);
}

/** Two-column fact display (label + value) — used in detail panels */
export function Fact({ label, value }: { label: string; value: string }) {
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

// ---------------------------------------------------------------------------
// Time Formatting Helpers
// ---------------------------------------------------------------------------

/** Format timestamp as "Xs ago" / "Xm ago" / "Xh ago" / "Xd ago" */
export function formatAgo(timestamp: string | Date): string {
	try {
		const then =
			typeof timestamp === 'string'
				? new Date(timestamp.replace(' ', 'T') + 'Z').getTime()
				: timestamp.getTime();
		const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
		if (diffSec < 60) return `${diffSec}s ago`;
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		return `${Math.round(diffHr / 24)}d ago`;
	} catch {
		return String(timestamp);
	}
}

/** Format age from createdAt timestamp as duration string */
export function formatAge(createdAt: string): string {
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

/** Format seconds into "Xh Ym" or "Xm" */
export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

// ---------------------------------------------------------------------------
// Size Formatting Helpers
// ---------------------------------------------------------------------------

/** Format bytes as "X B" / "X KB" / "X MB" / "X GB" */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}

/** Format size in KB as "X KB" / "X MB" / "X GB" */
export function formatSize(kb: number): string {
	if (kb < 1024) return `${kb} KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Status/State Helpers
// ---------------------------------------------------------------------------

/** Map generic status to badge tone */
export function statusTone(
	status: 'ok' | 'error' | 'warning' | 'pending' | 'success' | 'neutral',
): BadgeTone {
	if (status === 'ok' || status === 'success') return 'success';
	if (status === 'error') return 'danger';
	if (status === 'warning') return 'warning';
	if (status === 'pending') return 'neutral';
	return 'neutral';
}

/** Map generic status to color */
export function statusColor(
	status: 'ok' | 'error' | 'warning' | 'pending' | 'success' | 'neutral',
): string {
	if (status === 'ok' || status === 'success') return tokens.color.success;
	if (status === 'error') return tokens.color.danger;
	if (status === 'warning') return tokens.color.warning;
	return tokens.color.textFaint;
}

// ---------------------------------------------------------------------------
// Shared StyleSheet Patterns
// ---------------------------------------------------------------------------

/** Common adapter row/card/detail styles — reuse across all adapters */
const styles = StyleSheet.create({
	divider: {
		marginTop: tokens.space.xs,
	},
	dividerLine: {
		flexGrow: 1,
		flexShrink: 1,
		height: StyleSheet.hairlineWidth,
		backgroundColor: tokens.color.border,
	},
	dividerLabel: {
		fontSize: 10,
		textTransform: 'uppercase',
		letterSpacing: 1,
		flexShrink: 0,
	},
	factValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});

export const adapterStyles = StyleSheet.create({
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

// ---------------------------------------------------------------------------
// Number Coercion Helpers
// ---------------------------------------------------------------------------

/** Coerce ClickHouse UInt64 string or number to number (defaults to 0) */
export function num(v: number | string | null | undefined): number {
	if (v === null || v === undefined) return 0;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : 0;
}
