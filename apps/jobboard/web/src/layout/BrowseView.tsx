import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, Surface, Text, Badge, tokens } from '@kbve/rn/ui';
import { fetchVerticals, type Vertical } from '../api/client';

export function BrowseView() {
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
				<Text tone="muted">Loading…</Text>
			) : (
				<View
					style={{
						flexDirection: 'row',
						flexWrap: 'wrap',
						gap: tokens.space.md,
					}}>
					{verticals.map((v) => (
						<Surface
							key={v.id}
							padded
							style={{ width: 280, gap: tokens.space.sm }}>
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
						</Surface>
					))}
				</View>
			)}
		</Stack>
	);
}
