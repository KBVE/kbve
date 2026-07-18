import { memo, useState } from 'react';
import { Pressable } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';

export interface NavItemProps {
	label: string;
	icon?: string;
	active?: boolean;
	onPress: () => void;
	mode?: 'auto' | 'expanded' | 'compact';
}

export const NavItem = memo(function NavItem({
	label,
	active,
	onPress,
}: NavItemProps) {
	const [hover, setHover] = useState(false);
	const color =
		active || hover ? tokens.color.primary : tokens.color.textMuted;

	return (
		<Pressable
			accessibilityRole="link"
			accessibilityLabel={label}
			onPress={onPress}
			onHoverIn={() => setHover(true)}
			onHoverOut={() => setHover(false)}
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: tokens.space.xs,
				paddingVertical: tokens.space.xs,
			}}>
			<Text style={{ fontSize: 15, fontWeight: '600', color }}>
				{label}
			</Text>
		</Pressable>
	);
});
