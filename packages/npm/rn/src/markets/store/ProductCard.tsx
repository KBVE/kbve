import { Badge } from '../../ui/primitives/Badge';
import { Button } from '../../ui/primitives/Button';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import type { StoreProduct } from './types';

export interface ProductCardProps {
	product: StoreProduct;
	owned: boolean;
	authenticated: boolean;
	busy: boolean;
	onBuyDigital: (slug: string) => void;
	onBuyPhysical: (slug: string) => void;
}

export function ProductCard({
	product,
	owned,
	authenticated,
	busy,
	onBuyDigital,
	onBuyPhysical,
}: ProductCardProps) {
	const price = `${product.price.toLocaleString()} ${product.currency}`;
	const physical = product.fulfillment !== 'digital';
	return (
		<Surface>
			<Stack gap="xs">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="subtitle">{product.title}</Text>
					<Badge tone="neutral" label={product.fulfillment} />
				</Stack>
				<Text variant="caption" tone="muted">
					{owned ? 'Unlocked. You own this.' : (product.description ?? '')}
				</Text>
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="body">{price}</Text>
					{owned ? (
						<Badge tone="success" label="Owned" />
					) : !authenticated ? (
						<Text variant="caption" tone="muted">{`Sign in to buy · ${price}`}</Text>
					) : (
						<Button
							title={busy ? 'Purchasing…' : `Buy · ${price}`}
							variant="primary"
							disabled={busy}
							onPress={() =>
								physical
									? onBuyPhysical(product.slug)
									: onBuyDigital(product.slug)
							}
						/>
					)}
				</Stack>
			</Stack>
		</Surface>
	);
}
