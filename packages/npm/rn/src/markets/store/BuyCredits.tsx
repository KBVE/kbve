import { useState } from 'react';
import { Button } from '../../ui/primitives/Button';
import { Stack } from '../../ui/primitives/Stack';
import { Surface } from '../../ui/primitives/Surface';
import { Text } from '../../ui/primitives/Text';
import type { StoreApi } from './api';
import { CREDIT_PACKS } from './types';
import { StoreApiError } from './errors';
import { openCheckout } from './openCheckout';

export interface BuyCreditsProps {
	api: StoreApi;
	authenticated: boolean;
}

export function BuyCredits({ api, authenticated }: BuyCreditsProps) {
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const buy = async (packId: string) => {
		setBusy(packId);
		setError(null);
		try {
			const { checkout_url } = await api.topupCheckout(packId);
			openCheckout(checkout_url);
		} catch (e) {
			if (e instanceof StoreApiError && e.status === 503)
				setError('Credit top-up is not available yet.');
			else if (e instanceof StoreApiError && e.status === 401)
				setError('Sign in to buy credits.');
			else setError(e instanceof Error ? e.message : 'checkout failed');
			setBusy(null);
		}
	};

	return (
		<Surface>
			<Stack gap="sm">
				<Text variant="subtitle">Buy credits</Text>
				<Text variant="caption" tone="muted">
					Top up with Stripe. Credits buy anything in the store.
				</Text>
				{error ? (
					<Text variant="caption" tone="danger">
						{error}
					</Text>
				) : null}
				<Stack direction="row" gap="sm">
					{CREDIT_PACKS.map((p) => (
						<Button
							key={p.pack_id}
							title={busy === p.pack_id ? 'Redirecting…' : p.label}
							variant="secondary"
							disabled={!authenticated || busy !== null}
							onPress={() => void buy(p.pack_id)}
						/>
					))}
				</Stack>
				{!authenticated ? (
					<Text variant="caption" tone="muted">
						Sign in to buy credits.
					</Text>
				) : null}
			</Stack>
		</Surface>
	);
}
