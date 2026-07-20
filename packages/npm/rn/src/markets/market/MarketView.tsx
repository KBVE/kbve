import { useMemo } from 'react';
import { Stack } from '../../ui/primitives/Stack';
import { Text } from '../../ui/primitives/Text';
import { createMarketApi } from './api';
import { MarketBrowse } from './MarketBrowse';
import { MarketCreateForm } from './MarketCreateForm';

export interface MarketViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
	onOpen?: (listingId: number) => void;
}

export function MarketView({
	getToken,
	baseUrl = '',
	authenticated,
	onOpen,
}: MarketViewProps) {
	const api = useMemo(
		() => createMarketApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const open =
		onOpen ??
		((id: number) => {
			window.location.href = `/market/listing/?id=${id}`;
		});
	return (
		<Stack gap="lg">
			<Text variant="subtitle">Sell an item</Text>
			<MarketCreateForm
				api={api}
				authenticated={authenticated}
				onCreated={open}
			/>
			<Text variant="subtitle">Active listings</Text>
			<MarketBrowse api={api} onOpen={open} />
		</Stack>
	);
}
