import { ScrollView, StyleSheet } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import { SectionDivider } from '../shared';
import { useStream, useStreamLifecycle } from '../useStream';
import type { StreamStore } from '../types';
import type { TelemetryEventItem } from './telemetryTypes';

export interface EventDrawerProps {
	store: StreamStore<TelemetryEventItem>;
	/** Null while nothing is expanded, which is a different state from "expanded
	 *  but no events came back" and is rendered as nothing rather than as empty. */
	fingerprint: string | null;
}

function DeviceFacts({ extra }: { extra: Record<string, string> }) {
	const keys = Object.keys(extra).sort();
	if (keys.length === 0) return null;
	return (
		<Stack direction="row" gap="xs" wrap>
			{keys.map((k) => (
				<Badge key={k} label={`${k}: ${extra[k]}`} tone="neutral" />
			))}
		</Stack>
	);
}

export function EventDrawer({ store, fingerprint }: EventDrawerProps) {
	useStreamLifecycle(store);
	const state = useStream(store);

	if (!fingerprint) return null;

	return (
		<Stack gap="xs">
			<SectionDivider label="Recent events" />
			{state.error ? (
				<Text variant="caption" tone="muted">
					{state.error}
				</Text>
			) : state.loading && state.items.length === 0 ? (
				<Text variant="caption" tone="muted">
					loading events…
				</Text>
			) : state.items.length === 0 ? (
				<Text variant="caption" tone="muted">
					No events retained for this group — the raw table keeps 30 days.
				</Text>
			) : (
				<Stack gap="xs">
					{state.items.map((ev) => (
						<Surface key={ev.id} style={styles.event}>
							<Stack gap="xs">
								<Stack direction="row" gap="xs" align="center">
									<Badge
										label={ev.handled ? 'handled' : 'unhandled'}
										tone={ev.handled ? 'neutral' : 'danger'}
									/>
									<Text variant="caption" tone="faint">
										{ev.timestamp || '—'}
									</Text>
								</Stack>
								<Text variant="body">{ev.message}</Text>
								<Text variant="caption" tone="muted">
									{[ev.platform, ev.environment, ev.release, ev.url]
										.filter(Boolean)
										.join(' · ')}
								</Text>
								<DeviceFacts extra={ev.extra} />
								{ev.stack ? (
									// Horizontal scroll rather than wrapping: a wrapped
									// backtrace is unreadable, and these are Rust frames.
									<ScrollView horizontal style={styles.stack}>
										<Text variant="caption" tone="faint">
											{ev.stack}
										</Text>
									</ScrollView>
								) : null}
							</Stack>
						</Surface>
					))}
				</Stack>
			)}
		</Stack>
	);
}

const styles = StyleSheet.create({
	event: { padding: tokens.space.md },
	stack: { maxHeight: 180 },
});
