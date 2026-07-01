import { memo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ReactNode } from 'react';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { Button, type ButtonVariant } from '../primitives/Button';
import { openExternal } from '../../platform/openExternal';

const CONTENT_MAX = 1120;

const container = (extra?: object) => ({
	width: '100%' as const,
	maxWidth: CONTENT_MAX,
	alignSelf: 'center' as const,
	...extra,
});

/* ─────────────────────────── Hero ─────────────────────────── */

export interface HeroAction {
	label: string;
	href: string;
	variant?: ButtonVariant;
	external?: boolean;
}

export interface HeroProps {
	eyebrow?: string;
	lead: string;
	accent?: string;
	tail?: string;
	subtitle?: string;
	actions?: HeroAction[];
	onNavigate?: (href: string) => void;
}

export const Hero = memo(function Hero({
	eyebrow,
	lead,
	accent,
	tail,
	subtitle,
	actions = [],
	onNavigate,
}: HeroProps) {
	const { width } = useWindowDimensions();
	const titleSize = width < 600 ? 38 : width < 960 ? 52 : 64;

	const fire = (a: HeroAction) =>
		a.external ? openExternal(a.href) : onNavigate?.(a.href);

	return (
		<View style={styles.heroWrap}>
			<View style={[container(), styles.heroInner]}>
				{eyebrow ? (
					<View style={styles.eyebrow}>
						<Text style={styles.eyebrowText}>{eyebrow}</Text>
					</View>
				) : null}
				<Text
					style={[
						styles.heroTitle,
						{ fontSize: titleSize, lineHeight: titleSize * 1.06 },
					]}>
					{lead}
					{accent ? (
						<Text style={[styles.heroTitle, styles.heroAccent]}>
							{accent}
						</Text>
					) : null}
					{tail}
				</Text>
				{subtitle ? (
					<Text style={styles.heroSub}>{subtitle}</Text>
				) : null}
				{actions.length > 0 ? (
					<View style={styles.heroActions}>
						{actions.map((a) => (
							<Button
								key={a.href}
								title={a.label}
								variant={a.variant ?? 'primary'}
								onPress={() => fire(a)}
							/>
						))}
					</View>
				) : null}
			</View>
		</View>
	);
});

/* ─────────────────────── Section heading ───────────────────── */

export interface SectionHeadingProps {
	title: string;
	subtitle?: string;
}

export const SectionHeading = memo(function SectionHeading({
	title,
	subtitle,
}: SectionHeadingProps) {
	return (
		<View style={styles.headingWrap}>
			<Text style={styles.headingTitle}>{title}</Text>
			{subtitle ? (
				<Text style={styles.headingSub}>{subtitle}</Text>
			) : null}
		</View>
	);
});

/* ───────────────────────── Feature card ────────────────────── */

export interface FeatureCardProps {
	title: string;
	body: string;
	icon?: ReactNode;
}

export const FeatureCard = memo(function FeatureCard({
	title,
	body,
	icon,
}: FeatureCardProps) {
	return (
		<View style={styles.card}>
			{icon ? <View style={styles.cardIcon}>{icon}</View> : null}
			<Text style={styles.cardTitle}>{title}</Text>
			<Text style={styles.cardBody}>{body}</Text>
		</View>
	);
});

export const FeatureGrid = memo(function FeatureGrid({
	title,
	subtitle,
	features,
}: {
	title?: string;
	subtitle?: string;
	features: FeatureCardProps[];
}) {
	return (
		<View style={styles.section}>
			{title ? (
				<SectionHeading title={title} subtitle={subtitle} />
			) : null}
			<View style={styles.grid}>
				{features.map((f) => (
					<FeatureCard key={f.title} title={f.title} body={f.body} />
				))}
			</View>
		</View>
	);
});

/* ─────────────────────────── Section ───────────────────────── */

export interface SectionProps {
	title?: string;
	subtitle?: string;
	children?: ReactNode;
}

export const Section = memo(function Section({
	title,
	subtitle,
	children,
}: SectionProps) {
	return (
		<View style={styles.section}>
			{title ? (
				<SectionHeading title={title} subtitle={subtitle} />
			) : null}
			{children}
		</View>
	);
});

/* ───────────────────────── Stat strip ──────────────────────── */

export interface StatItem {
	value: string;
	label: string;
}

export const StatStrip = memo(function StatStrip({
	stats,
}: {
	stats: StatItem[];
}) {
	return (
		<View style={styles.statBand}>
			<View style={[container(), styles.statRow]}>
				{stats.map((s) => (
					<View key={s.label} style={styles.stat}>
						<Text style={styles.statValue}>{s.value}</Text>
						<Text style={styles.statLabel}>{s.label}</Text>
					</View>
				))}
			</View>
		</View>
	);
});

/* ──────────────────────── Project card ─────────────────────── */

export interface ProjectItem {
	name: string;
	tag: string;
	body: string;
	href: string;
}

export const ProjectCard = memo(function ProjectCard({
	project,
	onNavigate,
}: {
	project: ProjectItem;
	onNavigate?: (href: string) => void;
}) {
	const [hover, setHover] = useState(false);
	return (
		<Pressable
			accessibilityRole="link"
			onPress={() => onNavigate?.(project.href)}
			onHoverIn={() => setHover(true)}
			onHoverOut={() => setHover(false)}
			style={[
				styles.project,
				hover && styles.projectHover,
				{ cursor: 'pointer' } as never,
			]}>
			<View style={styles.projectTag}>
				<Text style={styles.projectTagText}>{project.tag}</Text>
			</View>
			<Text style={styles.projectName}>{project.name}</Text>
			<Text style={styles.projectBody}>{project.body}</Text>
			<Text
				style={[styles.projectLink, hover && styles.projectLinkHover]}>
				Learn more →
			</Text>
		</Pressable>
	);
});

export const ProjectGrid = memo(function ProjectGrid({
	title,
	subtitle,
	projects,
	onNavigate,
}: {
	title?: string;
	subtitle?: string;
	projects: ProjectItem[];
	onNavigate?: (href: string) => void;
}) {
	return (
		<View style={styles.section}>
			{title ? (
				<SectionHeading title={title} subtitle={subtitle} />
			) : null}
			<View style={styles.grid}>
				{projects.map((p) => (
					<ProjectCard
						key={p.name}
						project={p}
						onNavigate={onNavigate}
					/>
				))}
			</View>
		</View>
	);
});

/* ───────────────────────── CTA section ─────────────────────── */

export const CtaSection = memo(function CtaSection({
	title,
	subtitle,
	actions = [],
	onNavigate,
}: {
	title: string;
	subtitle?: string;
	actions?: HeroAction[];
	onNavigate?: (href: string) => void;
}) {
	const fire = (a: HeroAction) =>
		a.external ? openExternal(a.href) : onNavigate?.(a.href);
	return (
		<View style={styles.ctaWrap}>
			<View style={styles.ctaInner}>
				<Text style={styles.ctaTitle}>{title}</Text>
				{subtitle ? (
					<Text style={styles.ctaSub}>{subtitle}</Text>
				) : null}
				{actions.length > 0 ? (
					<View style={styles.heroActions}>
						{actions.map((a) => (
							<Button
								key={a.href}
								title={a.label}
								variant={a.variant ?? 'primary'}
								onPress={() => fire(a)}
							/>
						))}
					</View>
				) : null}
			</View>
		</View>
	);
});

/* ──────────────────────── Process steps ────────────────────── */

export interface StepItem {
	title: string;
	body: string;
}

export const ProcessSteps = memo(function ProcessSteps({
	title,
	subtitle,
	steps,
}: {
	title?: string;
	subtitle?: string;
	steps: StepItem[];
}) {
	return (
		<View style={styles.section}>
			{title ? (
				<SectionHeading title={title} subtitle={subtitle} />
			) : null}
			<View style={styles.grid}>
				{steps.map((s, i) => (
					<View key={s.title} style={styles.step}>
						<View style={styles.stepNum}>
							<Text style={styles.stepNumText}>
								{String(i + 1).padStart(2, '0')}
							</Text>
						</View>
						<Text style={styles.stepTitle}>{s.title}</Text>
						<Text style={styles.stepBody}>{s.body}</Text>
					</View>
				))}
			</View>
		</View>
	);
});

/* ──────────────────────── Testimonials ─────────────────────── */

export interface TestimonialItem {
	quote: string;
	name: string;
	role?: string;
	initials?: string;
}

export const Testimonials = memo(function Testimonials({
	title,
	subtitle,
	items,
}: {
	title?: string;
	subtitle?: string;
	items: TestimonialItem[];
}) {
	return (
		<View style={styles.section}>
			{title ? (
				<SectionHeading title={title} subtitle={subtitle} />
			) : null}
			<View style={styles.grid}>
				{items.map((t) => (
					<View key={t.name} style={styles.quoteCard}>
						<Text style={styles.quoteText}>“{t.quote}”</Text>
						<View style={styles.quoteFoot}>
							<View style={styles.avatar}>
								<Text style={styles.avatarText}>
									{t.initials ??
										t.name.slice(0, 2).toUpperCase()}
								</Text>
							</View>
							<View style={styles.quoteMeta}>
								<Text style={styles.quoteName}>{t.name}</Text>
								{t.role ? (
									<Text style={styles.quoteRole}>
										{t.role}
									</Text>
								) : null}
							</View>
						</View>
					</View>
				))}
			</View>
		</View>
	);
});

/* ───────────────────────── Live feed ───────────────────────── */

export interface FeedRow {
	label: string;
	value: string;
	status?: 'ok' | 'warn' | 'error';
}

const statusColor = {
	ok: tokens.color.success,
	warn: tokens.color.warning,
	error: tokens.color.danger,
} as const;

export const LiveFeed = memo(function LiveFeed({
	title,
	label = 'live feed',
	rows,
	footer,
}: {
	title?: string;
	label?: string;
	rows: FeedRow[];
	footer?: string;
}) {
	return (
		<View style={styles.section}>
			{title ? <SectionHeading title={title} /> : null}
			<View style={styles.feed}>
				<View style={styles.feedBar}>
					<View style={styles.feedDots}>
						<View
							style={[styles.dot, { backgroundColor: '#ef4444' }]}
						/>
						<View
							style={[styles.dot, { backgroundColor: '#f59e0b' }]}
						/>
						<View
							style={[styles.dot, { backgroundColor: '#22c55e' }]}
						/>
					</View>
					<Text style={styles.feedLabel}>{label}</Text>
					<View style={styles.feedDots} />
				</View>
				<View style={styles.feedBody}>
					{rows.map((r) => (
						<View key={r.label} style={styles.feedRow}>
							<View
								style={[
									styles.feedStatus,
									{
										backgroundColor:
											statusColor[r.status ?? 'ok'],
									},
								]}
							/>
							<Text style={styles.feedRowLabel}>{r.label}</Text>
							<Text style={styles.feedRowValue}>{r.value}</Text>
						</View>
					))}
					{footer ? (
						<Text style={styles.feedFooter}>{footer}</Text>
					) : null}
				</View>
			</View>
		</View>
	);
});

/* ─────────────────────────── Styles ────────────────────────── */

const styles = StyleSheet.create({
	heroWrap: {
		paddingHorizontal: tokens.space.lg,
		paddingTop: 96,
		paddingBottom: 72,
		alignItems: 'center',
	},
	heroInner: { alignItems: 'center', gap: tokens.space.lg, maxWidth: 760 },
	eyebrow: {
		paddingHorizontal: tokens.space.md,
		paddingVertical: 6,
		borderRadius: tokens.radius.pill,
		borderWidth: 1,
		borderColor: tokens.color.border,
		backgroundColor: tokens.color.surface,
	},
	eyebrowText: {
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: 2,
		textTransform: 'uppercase',
		color: tokens.color.primary,
	},
	heroTitle: {
		fontWeight: '800',
		letterSpacing: -1,
		color: tokens.color.text,
		textAlign: 'center',
	},
	heroAccent: { color: tokens.color.primary },
	heroSub: {
		fontSize: 18,
		lineHeight: 28,
		color: tokens.color.textMuted,
		textAlign: 'center',
		maxWidth: 620,
	},
	heroActions: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: tokens.space.sm,
		justifyContent: 'center',
		marginTop: tokens.space.sm,
	},

	section: {
		width: '100%',
		maxWidth: CONTENT_MAX,
		alignSelf: 'center',
		paddingHorizontal: tokens.space.lg,
		paddingVertical: 80,
	},
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.lg },

	headingWrap: {
		alignItems: 'center',
		gap: tokens.space.xs,
		maxWidth: 640,
		alignSelf: 'center',
		marginBottom: tokens.space.xxl,
	},
	headingTitle: {
		fontSize: 34,
		fontWeight: '800',
		letterSpacing: -0.5,
		color: tokens.color.text,
		textAlign: 'center',
	},
	headingSub: {
		fontSize: 16,
		color: tokens.color.textMuted,
		textAlign: 'center',
	},

	card: {
		flex: 1,
		minWidth: 220,
		gap: tokens.space.sm,
		padding: tokens.space.xl,
		borderRadius: tokens.radius.xl,
		backgroundColor: tokens.color.surface,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	cardIcon: {
		width: 44,
		height: 44,
		borderRadius: tokens.radius.md,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: tokens.color.surfaceAlt,
		marginBottom: tokens.space.xs,
	},
	cardTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: tokens.color.primary,
	},
	cardBody: { fontSize: 14, lineHeight: 21, color: tokens.color.textMuted },

	statBand: {
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: tokens.color.border,
		backgroundColor: tokens.color.bgSubtle,
		paddingHorizontal: tokens.space.lg,
	},
	statRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-around',
		paddingVertical: tokens.space.xl,
		gap: tokens.space.lg,
	},
	stat: { alignItems: 'center', gap: 4, minWidth: 120 },
	statValue: {
		fontSize: 36,
		fontWeight: '800',
		color: tokens.color.primary,
	},
	statLabel: {
		fontSize: 12,
		letterSpacing: 1,
		textTransform: 'uppercase',
		color: tokens.color.textMuted,
	},

	project: {
		flex: 1,
		minWidth: 260,
		gap: tokens.space.sm,
		padding: tokens.space.xl,
		borderRadius: tokens.radius.xl,
		backgroundColor: tokens.color.surface,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	projectHover: { borderColor: tokens.color.primary },
	projectTag: {
		alignSelf: 'flex-start',
		paddingHorizontal: tokens.space.sm,
		paddingVertical: 3,
		borderRadius: tokens.radius.pill,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	projectTagText: {
		fontSize: 11,
		fontWeight: '700',
		letterSpacing: 1,
		textTransform: 'uppercase',
		color: tokens.color.primary,
	},
	projectName: { fontSize: 22, fontWeight: '800', color: tokens.color.text },
	projectBody: {
		fontSize: 14,
		lineHeight: 21,
		color: tokens.color.textMuted,
	},
	projectLink: {
		fontSize: 14,
		fontWeight: '700',
		color: tokens.color.primary,
		marginTop: tokens.space.xs,
	},
	projectLinkHover: { color: tokens.color.primaryDeep },

	ctaWrap: {
		paddingVertical: 88,
		paddingHorizontal: tokens.space.lg,
		alignItems: 'center',
		backgroundColor: tokens.color.bg,
	},
	ctaInner: { alignItems: 'center', gap: tokens.space.md, maxWidth: 640 },
	ctaTitle: {
		fontSize: 40,
		fontWeight: '800',
		letterSpacing: -0.5,
		color: tokens.color.text,
		textAlign: 'center',
	},
	ctaSub: {
		fontSize: 18,
		color: tokens.color.textMuted,
		textAlign: 'center',
	},

	step: {
		flex: 1,
		minWidth: 220,
		gap: tokens.space.sm,
		padding: tokens.space.xl,
		borderRadius: tokens.radius.xl,
		backgroundColor: tokens.color.surface,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	stepNum: {
		width: 44,
		height: 44,
		borderRadius: tokens.radius.pill,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: tokens.color.surfaceAlt,
		borderWidth: 1,
		borderColor: tokens.color.border,
		marginBottom: tokens.space.xs,
	},
	stepNumText: {
		fontSize: 16,
		fontWeight: '800',
		color: tokens.color.primary,
	},
	stepTitle: { fontSize: 18, fontWeight: '700', color: tokens.color.text },
	stepBody: { fontSize: 14, lineHeight: 21, color: tokens.color.textMuted },

	quoteCard: {
		flex: 1,
		minWidth: 280,
		gap: tokens.space.lg,
		padding: tokens.space.xl,
		borderRadius: tokens.radius.xl,
		backgroundColor: tokens.color.surface,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	quoteText: {
		fontSize: 16,
		lineHeight: 25,
		color: tokens.color.text,
	},
	quoteFoot: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.md,
	},
	avatar: {
		width: 42,
		height: 42,
		borderRadius: tokens.radius.pill,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: tokens.color.surfaceAlt,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	avatarText: {
		fontSize: 13,
		fontWeight: '800',
		color: tokens.color.primary,
	},
	quoteMeta: { gap: 2 },
	quoteName: { fontSize: 14, fontWeight: '700', color: tokens.color.text },
	quoteRole: { fontSize: 12, color: tokens.color.textMuted },

	feed: {
		width: '100%',
		maxWidth: 640,
		alignSelf: 'center',
		borderRadius: tokens.radius.xl,
		borderWidth: 1,
		borderColor: tokens.color.border,
		backgroundColor: tokens.color.bg,
		overflow: 'hidden',
	},
	feedBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
		borderBottomWidth: 1,
		borderBottomColor: tokens.color.border,
		backgroundColor: tokens.color.surface,
	},
	feedDots: { flexDirection: 'row', gap: 6, width: 52 },
	dot: { width: 11, height: 11, borderRadius: tokens.radius.pill },
	feedLabel: {
		fontSize: 12,
		letterSpacing: 1,
		color: tokens.color.textMuted,
	},
	feedBody: { padding: tokens.space.lg, gap: tokens.space.sm },
	feedRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
	},
	feedStatus: { width: 8, height: 8, borderRadius: tokens.radius.pill },
	feedRowLabel: {
		flex: 1,
		fontSize: 13,
		color: tokens.color.text,
	},
	feedRowValue: {
		fontSize: 13,
		fontWeight: '700',
		color: tokens.color.primary,
	},
	feedFooter: {
		marginTop: tokens.space.xs,
		paddingTop: tokens.space.sm,
		borderTopWidth: 1,
		borderTopColor: tokens.color.border,
		fontSize: 12,
		letterSpacing: 1,
		color: tokens.color.textMuted,
	},
});
