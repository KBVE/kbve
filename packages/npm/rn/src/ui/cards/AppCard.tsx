import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { PressableSurface } from '../primitives/PressableSurface';
import { Text } from '../primitives/Text';
import type { CardModel } from '../models';

export const AppCard = memo(function AppCard({ model }: { model: CardModel }) {
	const variant = model.variant ?? 'default';
	return (
		<PressableSurface
			disabled={model.disabled}
			onPress={model.onPress}
			padded={variant !== 'media'}>
			{variant === 'media' && model.imageUrl ? (
				<Image
					source={{ uri: model.imageUrl }}
					style={styles.media}
					resizeMode="cover"
				/>
			) : null}

			<View style={variant === 'media' ? styles.mediaBody : undefined}>
				<View style={styles.header}>
					<View style={styles.headerText}>
						{variant === 'stat' && model.statValue ? (
							<Text variant="display">{model.statValue}</Text>
						) : null}
						<Text
							variant={
								variant === 'compact' ? 'label' : 'subtitle'
							}>
							{model.title}
						</Text>
						{model.subtitle ? (
							<Text variant="caption" tone="muted">
								{model.subtitle}
							</Text>
						) : null}
					</View>
					{model.badge ? (
						<Badge
							label={model.badge}
							tone={model.badgeTone ?? 'neutral'}
						/>
					) : null}
					{variant === 'stat' && model.statDelta ? (
						<Text variant="label" tone="success">
							{model.statDelta}
						</Text>
					) : null}
				</View>

				{model.description && variant !== 'compact' ? (
					<Text
						variant="body"
						tone="muted"
						style={styles.description}>
						{model.description}
					</Text>
				) : null}

				{model.actions?.length ? (
					<View style={styles.actions}>
						{model.actions.map((action) => (
							<Button
								key={action.id}
								title={action.label}
								variant={
									action.destructive ? 'danger' : 'ghost'
								}
								disabled={action.disabled}
								onPress={action.execute}
							/>
						))}
					</View>
				) : null}
			</View>
		</PressableSurface>
	);
});

const styles = StyleSheet.create({
	media: {
		width: '100%',
		height: 160,
		borderTopLeftRadius: tokens.radius.lg,
		borderTopRightRadius: tokens.radius.lg,
	},
	mediaBody: { padding: tokens.space.lg },
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
	},
	headerText: { flex: 1, gap: 2 },
	description: { marginTop: tokens.space.sm },
	actions: {
		flexDirection: 'row',
		gap: tokens.space.sm,
		marginTop: tokens.space.md,
	},
});
