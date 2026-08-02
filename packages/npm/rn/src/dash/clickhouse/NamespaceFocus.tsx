import { Pressable, StyleSheet } from 'react-native';
import { Surface, Stack, Text, Badge, tokens } from '../_ui';
import { useStream } from '../useStream';
import type { StreamStore } from '../types';
import type { LogItem } from '../adapters/clickhouse';
import { buildNamespaceRollup } from './chRollup';
import { errorGroupsLens, type ErrorGroupItem } from './errorGroupsStream';
import { SectionDivider } from '../shared';

const LEVELS = [
	{ label: 'All', value: undefined },
	{ label: 'Errors', value: 'error' },
	{ label: 'Warnings', value: 'warn' },
	{ label: 'Info', value: 'info' },
] as const;

export function NamespaceFocus({
	store,
	errors,
	meta,
}: {
	store: StreamStore<LogItem>;
	errors: StreamStore<ErrorGroupItem>;
	meta: unknown;
}) {
	const state = useStream(store);
	const errorState = useStream(errors);
	const ns = state.params['pod_namespace'];
	if (typeof ns !== 'string' || ns === '') return null;

	const roll = buildNamespaceRollup(meta).find((r) => r.namespace === ns);
	const activeLevel = state.params['level'];
	const groups = errorState.items.filter((g) => g.namespace === ns);

	return (
		<Stack gap="sm">
			<SectionDivider label="Namespace Focus" />
			<Surface style={styles.panel}>
				<Stack gap="sm">
					<Stack direction="row" align="center" gap="sm" wrap>
						<Text variant="subtitle" style={styles.title}>
							{ns}
						</Text>
						<Pressable
							onPress={() =>
								store.setParams({
									pod_namespace: undefined,
									level: undefined,
								})
							}
							style={styles.clear}>
							<Text variant="caption" tone="muted">
								✕ Clear
							</Text>
						</Pressable>
					</Stack>

					<Stack direction="row" gap="sm" wrap>
						<Badge
							label={`${roll?.errors ?? 0} errors`}
							tone="danger"
						/>
						<Badge
							label={`${roll?.warns ?? 0} warnings`}
							tone="warning"
						/>
						<Text variant="caption" tone="muted">
							{roll?.total ?? 0} total in window
						</Text>
					</Stack>

					<Stack direction="row" gap="xs" wrap>
						{LEVELS.map((l) => {
							const on = activeLevel === l.value;
							return (
								<Pressable
									key={l.label}
									onPress={() =>
										store.setParams({ level: l.value })
									}
									style={[
										styles.seg,
										on ? styles.segOn : null,
									]}>
									<Text
										variant="caption"
										weight={on ? 'medium' : undefined}
										style={{
											color: on
												? tokens.color.onPrimary
												: tokens.color.textMuted,
										}}>
										{l.label}
									</Text>
								</Pressable>
							);
						})}
					</Stack>

					{groups.length ? (
						<Stack gap="xs">
							<Text variant="caption" weight="medium" tone="muted">
								Top errors in {ns}
							</Text>
							{groups.slice(0, 5).map((g) => (
								<Pressable
									key={errors.id(g)}
									onPress={() =>
										store.setParams({ level: 'error' })
									}>
									{errorGroupsLens.row(g, false)}
								</Pressable>
							))}
						</Stack>
					) : null}
				</Stack>
			</Surface>
		</Stack>
	);
}

const styles = StyleSheet.create({
	panel: {
		padding: tokens.space.md,
		borderWidth: 1,
		borderColor: tokens.color.primary,
	},
	title: { flexGrow: 1 },
	clear: {
		paddingHorizontal: tokens.space.md,
		paddingVertical: 4,
		borderRadius: tokens.radius.pill,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	seg: {
		paddingHorizontal: tokens.space.md,
		paddingVertical: 4,
		borderRadius: tokens.radius.pill,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	segOn: {
		backgroundColor: tokens.color.primary,
		borderColor: tokens.color.primary,
	},
});
