import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawRepo {
	id: number;
	name: string;
	full_name: string;
	description: string;
	private: boolean;
	fork: boolean;
	mirror: boolean;
	archived: boolean;
	size: number;
	stars_count: number;
	watchers_count: number;
	forks_count: number;
	open_issues_count: number;
	open_pr_counter?: number;
	default_branch: string;
	created_at: string;
	updated_at: string;
	language?: string;
	html_url: string;
}

export interface ForgejoRepoItem {
	id: string;
	name: string;
	fullName: string;
	description: string;
	isPrivate: boolean;
	isArchived: boolean;
	isMirror: boolean;
	size: number;
	stars: number;
	openIssues: number;
	openPRs: number;
	language: string;
	updatedAt: string;
	age: string;
	htmlUrl: string;
}

export interface ForgejoStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
	limit?: number;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalize(raw: RawRepo): ForgejoRepoItem {
	const age = formatAge(raw.updated_at);

	return {
		id: String(raw.id),
		name: raw.name,
		fullName: raw.full_name,
		description: raw.description || '',
		isPrivate: raw.private,
		isArchived: raw.archived,
		isMirror: raw.mirror,
		size: raw.size,
		stars: raw.stars_count,
		openIssues: raw.open_issues_count,
		openPRs: raw.open_pr_counter ?? 0,
		language: raw.language ?? 'Unknown',
		updatedAt: raw.updated_at,
		age,
		htmlUrl: raw.html_url,
	};
}

function formatAge(updatedAt: string): string {
	try {
		const updated = new Date(updatedAt).getTime();
		const diffSec = Math.max(0, Math.round((Date.now() - updated) / 1000));
		if (diffSec < 60) return `${diffSec}s ago`;
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		return `${Math.round(diffHr / 24)}d ago`;
	} catch {
		return '—';
	}
}

function formatSize(kb: number): string {
	if (kb < 1024) return `${kb} KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createForgejoStream(
	opts: ForgejoStreamOptions,
): StreamStore<ForgejoRepoItem> {
	const { getToken, baseUrl = '', pollMs = 30_000, limit = 50 } = opts;

	return createStreamSource<RawRepo, ForgejoRepoItem>({
		key: 'forgejo:repos',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) =>
			`${it.updatedAt}|${it.stars}|${it.openIssues}|${it.openPRs}`,
		normalize,
		fetch: async ({ signal }) => {
			const token = await getToken();
			const res = await fetch(
				`${baseUrl}/dashboard/forgejo/api/repos/search?limit=${limit}&sort=updated`,
				{
					headers: token
						? { Authorization: `Bearer ${token}` }
						: undefined,
					signal,
				},
			);

			if (res.status === 403) throw new Error('Access restricted');
			if (res.status === 502)
				throw new Error('Forgejo upstream unreachable');
			if (!res.ok) throw new Error(`Forgejo API error: ${res.status}`);

			const json = (await res.json()) as { data?: RawRepo[] };
			const raw = json?.data ?? [];

			// Sort by updated_at descending (most recent first)
			return raw.sort((a, b) => {
				const tA = new Date(a.updated_at).getTime();
				const tB = new Date(b.updated_at).getTime();
				return tB - tA;
			});
		},
	});
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function visibilityTone(isPrivate: boolean): BadgeTone {
	return isPrivate ? 'neutral' : 'primary';
}

function languageColor(lang: string): string {
	const COLORS: Record<string, string> = {
		Go: '#00ADD8',
		Rust: '#DEA584',
		TypeScript: '#3178C6',
		JavaScript: '#F7DF1E',
		Python: '#3572A5',
		Shell: '#89E051',
		Dockerfile: '#384D54',
		HTML: '#E34C26',
		CSS: '#563D7C',
		Java: '#B07219',
		Kotlin: '#A97BFF',
		Swift: '#F05138',
		Markdown: '#083FA1',
		YAML: '#CB171E',
		Astro: '#FF5A03',
		Nix: '#7E7EFF',
		Zig: '#EC915C',
	};
	return COLORS[lang] ?? tokens.color.textFaint;
}

export const forgejoLens: StreamLens<ForgejoRepoItem> = {
	searchText: (it) => `${it.fullName} ${it.description} ${it.language}`,
	group: (it) => (it.isArchived ? 'Archived' : 'Active'),
	filters: [
		{
			id: 'private',
			label: 'Private',
			tone: 'neutral',
			predicate: (it) => it.isPrivate,
		},
		{
			id: 'public',
			label: 'Public',
			tone: 'primary',
			predicate: (it) => !it.isPrivate,
		},
		{
			id: 'archived',
			label: 'Archived',
			tone: 'neutral',
			predicate: (it) => it.isArchived,
		},
		{
			id: 'mirror',
			label: 'Mirror',
			tone: 'neutral',
			predicate: (it) => it.isMirror,
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Total Repos', value: items.length },
		{
			id: 'private',
			label: 'Private',
			tone: 'neutral',
			value: items.filter((i) => i.isPrivate).length,
		},
		{
			id: 'stars',
			label: 'Total Stars',
			tone: 'primary',
			value: items.reduce((sum, i) => sum + i.stars, 0),
		},
		{
			id: 'issues',
			label: 'Open Issues',
			tone: 'warning',
			value: items.reduce((sum, i) => sum + i.openIssues, 0),
		},
	],
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.langDot,
					{ backgroundColor: languageColor(it.language) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.fullName}
					</Text>
					{it.isPrivate && <Badge label="Private" tone="neutral" />}
					{it.isArchived && <Badge label="Archived" tone="neutral" />}
				</Stack>
				{it.description && (
					<Text variant="caption" tone="muted" numberOfLines={2}>
						{it.description}
					</Text>
				)}
				<Text variant="caption" tone="faint">
					{it.language} · ⭐ {it.stars} · 🐛 {it.openIssues} · Updated{' '}
					{it.age}
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
							styles.langDot,
							{ backgroundColor: languageColor(it.language) },
						]}
					/>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.fullName}
					</Text>
				</Stack>
				{it.description && (
					<Text variant="caption" tone="muted">
						{it.description}
					</Text>
				)}
				<Stack direction="row" gap="sm" wrap>
					<Badge
						label={it.isPrivate ? 'Private' : 'Public'}
						tone={visibilityTone(it.isPrivate)}
					/>
					{it.isArchived && <Badge label="Archived" tone="neutral" />}
					{it.isMirror && <Badge label="Mirror" tone="neutral" />}
				</Stack>
				<Text variant="caption" tone="faint">
					{it.language}
				</Text>
				<Text variant="caption" tone="faint">
					⭐ {it.stars} · 🐛 {it.openIssues} · 🔀 {it.openPRs}
				</Text>
				<Text variant="caption" tone="faint">
					{formatSize(it.size)} · Updated {it.age}
				</Text>
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Full Name" value={it.fullName} />
			<Fact
				label="Visibility"
				value={it.isPrivate ? 'PRIVATE' : 'PUBLIC'}
			/>
			{it.description && (
				<Fact label="Description" value={it.description} />
			)}
			<Fact label="Language" value={it.language} />
			<Fact label="Stars" value={String(it.stars)} />
			<Fact label="Open Issues" value={String(it.openIssues)} />
			<Fact label="Open PRs" value={String(it.openPRs)} />
			<Fact label="Size" value={formatSize(it.size)} />
			<Fact label="Last Updated" value={it.age} />
			{it.isArchived && <Fact label="Status" value="ARCHIVED" />}
			{it.isMirror && <Fact label="Type" value="MIRROR" />}
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
	langDot: {
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
