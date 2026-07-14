import { StyleSheet, View } from 'react-native';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { tokens } from '../ui/theme';
import { StatGrid } from '../dash/StatGrid';
import type { StatModel } from '../dash/types';
import { TrendChart } from '../dash/TrendChart';
import { useApiResource } from '../auth/useApi';
import { useAuth } from '../auth/useAuth';
import { describeLedgerRow, formatDelta, ledgerToHistory } from './walletMath';

const CREDITS_COLOR = '#b8860b';
const KHASH_COLOR = '#0d9488';
const RECENT_ROWS = 6;

export function WalletSection() {
	const auth = useAuth();
	const balance = useApiResource(
		(api) => api.wallet.balance(),
		[auth.signedIn],
	);
	const ledger = useApiResource(
		(api) => api.wallet.ledger({ source_kinds: 'all', limit: 100 }),
		[auth.signedIn],
	);

	const stats: StatModel[] = balance.data
		? [
				{
					id: 'credits',
					label: 'Credits',
					value: balance.data.credits.toLocaleString(),
				},
				{
					id: 'khash',
					label: 'Khash',
					value: balance.data.khash.toLocaleString(),
				},
			]
		: [];

	const rows = ledger.data?.rows ?? [];
	const history = ledgerToHistory(rows);
	const series = [
		{ label: 'Credits', color: CREDITS_COLOR, points: history.credits },
		{ label: 'Khash', color: KHASH_COLOR, points: history.khash },
	].filter((s) => s.points.length > 0);
	const recent = rows.slice(0, RECENT_ROWS);

	return (
		<Surface>
			<Stack gap="md">
				<Text variant="label">Wallet</Text>
				{balance.loading ? (
					<Text tone="muted">Loading…</Text>
				) : balance.error ? (
					<Text tone="muted">{balance.error}</Text>
				) : (
					<StatGrid stats={stats} />
				)}

				{series.length > 0 ? (
					<Stack direction="row" gap="md" wrap>
						{series.map((s) => (
							<TrendChart
								key={s.label}
								title={s.label}
								series={[s]}
								format={(v) => v.toLocaleString()}
								height={72}
							/>
						))}
					</Stack>
				) : null}

				{recent.length > 0 ? (
					<Stack gap="sm">
						<Text variant="caption" tone="muted">
							Recent activity
						</Text>
						{recent.map((row) => (
							<Stack
								key={row.ledger_id}
								direction="row"
								align="center"
								gap="sm">
								<View
									style={[
										styles.dot,
										{
											backgroundColor:
												row.currency === 'credits'
													? CREDITS_COLOR
													: KHASH_COLOR,
										},
									]}
								/>
								<Text
									variant="caption"
									style={styles.grow}
									numberOfLines={1}>
									{describeLedgerRow(row)}
								</Text>
								<Text
									variant="caption"
									weight="medium"
									style={{
										color:
											row.delta >= 0
												? tokens.color.success
												: tokens.color.danger,
									}}>
									{formatDelta(row.delta)}
								</Text>
								<Text variant="caption" tone="faint">
									{new Date(
										row.created_at,
									).toLocaleDateString()}
								</Text>
							</Stack>
						))}
					</Stack>
				) : ledger.loading ? null : (
					<Text variant="caption" tone="faint">
						No wallet activity yet
					</Text>
				)}
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	dot: { width: 8, height: 8, borderRadius: 4 },
	grow: { flexGrow: 1, flexShrink: 1 },
});
