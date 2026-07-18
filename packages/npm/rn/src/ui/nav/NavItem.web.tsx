import { memo, useState } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { NavIcon } from './NavIcon.web';

const DESKTOP_MIN_WIDTH = 768;

export interface NavItemProps {
	label: string;
	icon?: string;
	active?: boolean;
	onPress: () => void;
	/** Force a display mode; defaults to responsive on viewport width. */
	mode?: 'auto' | 'expanded' | 'compact';
}

export const NavItem = memo(function NavItem({
	label,
	icon,
	active,
	onPress,
	mode = 'auto',
}: NavItemProps) {
	const { width } = useWindowDimensions();
	const [hover, setHover] = useState(false);

	const expanded =
		mode === 'expanded' ||
		(mode === 'auto' && (width >= DESKTOP_MIN_WIDTH || !icon));
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
				paddingHorizontal: expanded ? 0 : tokens.space.xs,
				cursor: 'pointer' as never,
			}}>
			{icon ? <NavIcon name={icon} size={18} color={color} /> : null}
			{expanded ? (
				<Text style={{ fontSize: 15, fontWeight: '600', color }}>
					{label}
				</Text>
			) : null}
		</Pressable>
	);
});
