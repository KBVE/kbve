import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import type { StoreOrder } from './types';

export interface OrderHistoryProps {
	orders: StoreOrder[];
}

export function OrderHistory({ orders }: OrderHistoryProps) {
	if (orders.length === 0) return null;
	return (
		<Surface>
			<Stack gap="xs">
				<Text variant="subtitle">Your orders</Text>
				{orders.map((o) => (
					<Stack key={o.order_id} direction="row" justify="space-between">
						<Text variant="caption">
							{`#${o.order_id} · ${o.qty}× · ${o.credits_amount} credits · ${o.status}`}
						</Text>
						<Text variant="caption" tone="muted">
							{new Date(o.created_at).toLocaleDateString()}
						</Text>
					</Stack>
				))}
			</Stack>
		</Surface>
	);
}
