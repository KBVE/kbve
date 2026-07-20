import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useKbve } from '../auth/KbveProvider';
import { useAuth } from '../auth/useAuth';
import { Button } from '../ui/primitives/Button';
import { Stack } from '../ui/primitives/Stack';
import { StoreView } from '../markets/store/StoreView';
import { MarketView } from '../markets/market/MarketView';

type Tab = 'store' | 'market';

export function MarketsScreen() {
	const { client } = useKbve();
	const auth = useAuth();
	const authenticated = auth.signedIn;
	const [tab, setTab] = useState<Tab>('store');
	const getToken = useCallback(async () => {
		const { data } = await client.auth.getSession();
		return data.session?.access_token ?? null;
	}, [client]);

	return (
		<View>
			<Stack direction="row" gap="sm">
				<Button title="Store" variant={tab === 'store' ? 'primary' : 'ghost'} onPress={() => setTab('store')} />
				<Button title="Marketplace" variant={tab === 'market' ? 'primary' : 'ghost'} onPress={() => setTab('market')} />
			</Stack>
			{tab === 'store' ? (
				<StoreView getToken={getToken} baseUrl="https://kbve.com" authenticated={authenticated} />
			) : (
				<MarketView getToken={getToken} baseUrl="https://kbve.com" authenticated={authenticated} />
			)}
		</View>
	);
}

export default MarketsScreen;
