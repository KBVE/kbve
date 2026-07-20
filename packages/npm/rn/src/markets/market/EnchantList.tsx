import { Badge } from '../../ui/primitives/Badge';
import { Stack } from '../../ui/primitives/Stack';
import { Text } from '../../ui/primitives/Text';
import { enchantDef, formatEnchant, parseEnchants } from './enchants';

export interface EnchantListProps {
	itemRef: unknown;
	compact?: boolean;
}

export function EnchantList({ itemRef, compact = false }: EnchantListProps) {
	const enchants = parseEnchants(itemRef);
	if (enchants.length === 0) return null;
	if (compact) {
		return (
			<Text
				variant="caption"
				tone="muted"
				accessibilityLabel={enchants.map(formatEnchant).join(', ')}>
				{'✨ '}
				{enchants.length}
			</Text>
		);
	}
	return (
		<Stack
			direction="row"
			gap="xs"
			wrap
			accessibilityLabel="Enchantments">
			{enchants.map((e, i) => {
				const def = enchantDef(e.id);
				const tone = def?.curse
					? 'danger'
					: def?.treasure
						? 'warning'
						: 'neutral';
				return (
					<Badge
						key={`${e.id}-${i}`}
						label={formatEnchant(e)}
						tone={tone}
					/>
				);
			})}
		</Stack>
	);
}

export default EnchantList;
