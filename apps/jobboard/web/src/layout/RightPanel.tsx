import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, Text, Badge, tokens } from '@kbve/rn/ui';
import { Panel } from '../ui/Panel';
import { fetchTaxonomy, type TaxonomyItem, type Vertical } from '../api/client';

export type Selection = { kind: 'vertical'; vertical: Vertical } | null;

function Clock() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(t);
	}, []);
	const day = now.toLocaleDateString(undefined, {
		weekday: 'long',
		day: 'numeric',
	});
	const time = now.toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
	});
	return (
		<Panel gradient="accent" glow>
			<Text variant="caption" tone="muted">
				{day}
			</Text>
			<Text variant="display" weight="bold">
				{time}
			</Text>
		</Panel>
	);
}

function VerticalDetail({ vertical }: { vertical: Vertical }) {
	const [items, setItems] = useState<TaxonomyItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		setItems(null);
		setError(null);
		fetchTaxonomy(vertical.id)
			.then((r) => alive && setItems(r.taxonomy))
			.catch((e) => alive && setError(String(e)));
		return () => {
			alive = false;
		};
	}, [vertical.id]);

	return (
		<Stack gap="md">
			<Stack gap="xs">
				<Text variant="title">{vertical.label}</Text>
				<Text tone="muted" variant="caption">
					{vertical.description || 'No description yet.'}
				</Text>
			</Stack>
			<Text variant="label" tone="muted">
				Taxonomy
			</Text>
			{error ? (
				<Text tone="danger" variant="caption">
					{error}
				</Text>
			) : !items ? (
				<Text tone="muted" variant="caption">
					Loading…
				</Text>
			) : items.length === 0 ? (
				<Text tone="faint" variant="caption">
					No taxonomy yet.
				</Text>
			) : (
				<View
					style={{
						flexDirection: 'row',
						flexWrap: 'wrap',
						gap: tokens.space.xs,
					}}>
					{items.map((t) => (
						<Badge key={t.id} label={`${t.label}`} />
					))}
				</View>
			)}
		</Stack>
	);
}

export function RightPanel({ selection }: { selection: Selection }) {
	return (
		<Stack gap="lg" style={{ flex: 1 }}>
			<Clock />
			<Panel style={{ flex: 1 }}>
				{selection ? (
					<VerticalDetail vertical={selection.vertical} />
				) : (
					<Stack gap="xs">
						<Text variant="label" tone="muted">
							Details
						</Text>
						<Text tone="faint" variant="caption">
							Select an item to see more.
						</Text>
					</Stack>
				)}
			</Panel>
		</Stack>
	);
}
