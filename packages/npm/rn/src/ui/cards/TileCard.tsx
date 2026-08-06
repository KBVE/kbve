import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { tokens } from '../theme';
import { Badge } from '../primitives/Badge';
import type { BadgeTone } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';
import { PressableSurface } from '../primitives/PressableSurface';
import { Text } from '../primitives/Text';
import type { IconName } from '../../icons';

export interface TileCardProps {
	icon: IconName;
	title: string;
	blurb?: string;
	/** Strip + icon-chip tint. Defaults to the theme primary. */
	accent?: string;
	badge?: string;
	badgeTone?: BadgeTone;
	/** Renders the chevron affordance and the wider two-line layout. */
	wide?: boolean;
	onPress?: () => void;
	style?: StyleProp<ViewStyle>;
}

export const TileCard = memo(function TileCard({
	icon,
	title,
	blurb,
	accent = tokens.color.primary,
	badge,
	badgeTone = 'primary',
	wide = false,
	onPress,
	style,
}: TileCardProps) {
	return (
		<PressableSurface
			padded={false}
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={title}
			accessibilityHint={blurb}
			style={[styles.base, style]}>
			<View style={[styles.accent, { backgroundColor: accent }]} />
			<View style={[styles.body, wide ? styles.bodyWide : null]}>
				<View style={[styles.chip, { backgroundColor: `${accent}22` }]}>
					<Icon name={icon} size={20} color={accent} />
				</View>
				<View style={styles.meta}>
					<View style={styles.titleRow}>
						<Text
							variant="label"
							numberOfLines={1}
							style={styles.title}>
							{title}
						</Text>
						{badge ? (
							<Badge label={badge} tone={badgeTone} />
						) : null}
					</View>
					{blurb ? (
						<Text variant="caption" tone="muted" numberOfLines={2}>
							{blurb}
						</Text>
					) : null}
				</View>
				{wide ? (
					<Icon
						name="chevronRight"
						size={18}
						color={tokens.color.textFaint}
					/>
				) : null}
			</View>
		</PressableSurface>
	);
});

const styles = StyleSheet.create({
	base: { overflow: 'hidden' },
	accent: { height: 3 },
	body: {
		padding: tokens.space.md,
		gap: tokens.space.sm,
	},
	bodyWide: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.md,
	},
	chip: {
		width: 36,
		height: 36,
		borderRadius: tokens.radius.md,
		alignItems: 'center',
		justifyContent: 'center',
	},
	meta: { flex: 1, gap: 2 },
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.xs,
	},
	title: { flexShrink: 1 },
});
