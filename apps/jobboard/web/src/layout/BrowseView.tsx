import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
	Stack,
	PressableSurface,
	Text,
	Badge,
	Skeleton,
	tokens,
} from '@kbve/rn/ui';
import { fetchVerticals, type Vertical } from '../api/client';

export function BrowseView({
	selectedId,
	onSelect,
}: {
	selectedId?: number;
	onSelect: (v: Vertical) => void;
}) {
	const [verticals, setVerticals] = useState<Vertical[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		fetchVerticals()
			.then((r) => alive && setVerticals(r.verticals))
			.catch((e) => alive && setError(String(e)));
		return () => {
			alive = false;
		};
	}, []);

	return (
		<Stack gap="lg">
			<Stack gap="xs">
				<Text variant="title">Browse verticals</Text>
				<Text tone="muted">Pick a discipline to find work.</Text>
			</Stack>

			{error ? (
				<Text tone="danger">Failed to load: {error}</Text>
			) : !verticals ? (
				<View
					style={{
						flexDirection: 'row',
						flexWrap: 'wrap',
						gap: tokens.space.md,
					}}>
					{[0, 1, 2].map((i) => (
						<View
							key={i}
							style={{ width: 260, gap: tokens.space.sm }}>
							<Skeleton width="60%" height={20} />
							<Skeleton width="100%" />
							<Skeleton width="80%" />
						</View>
					))}
				</View>
			) : (
				<View
					style={{
						flexDirection: 'row',
						flexWrap: 'wrap',
						gap: tokens.space.md,
					}}>
					{verticals.map((v) => {
						const on = v.id === selectedId;
						return (
							<PressableSurface
								key={v.id}
								padded
								onPress={() => onSelect(v)}
								style={{
									width: 260,
									gap: tokens.space.sm,
									borderWidth: 1,
									borderColor: on
										? tokens.color.primary
										: 'transparent',
								}}>
								<Stack
									direction="row"
									align="center"
									justify="space-between">
									<Text variant="subtitle" weight="bold">
										{v.label}
									</Text>
									<Badge label={v.slug} />
								</Stack>
								<Text tone="muted" variant="caption">
									{v.description || 'No description yet.'}
								</Text>
							</PressableSurface>
						);
					})}
				</View>
			)}
		</Stack>
	);
}
