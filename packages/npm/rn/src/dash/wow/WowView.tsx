import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Stack, Text, tokens } from '../_ui';
import { StatGrid } from '../StatGrid';
import { RconConsole } from '../mc';
import { formatAgo } from '../shared';
import { useStream, useStreamLifecycle } from '../useStream';
import { CharacterTable } from './CharacterTable';
import { NodeCard } from './NodeCard';
import { WOW_COMMANDS } from './commands';
import { realmTypeName } from './labels';
import { createSoapExec, soapResultCaveat } from './soapExec';
import { createWowMetricsStream } from './wowMetrics';
import {
	createWowCharacterStream,
	createWowRealmStream,
	isNotProvisioned,
} from './wowStream';
import type { WowRealmCounts } from './wowStream';

export interface WowViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export function WowView({ getToken, baseUrl = '' }: WowViewProps) {
	const realms = useMemo(
		() => createWowRealmStream({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const nodes = useMemo(
		() => createWowMetricsStream({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const characters = useMemo(
		() => createWowCharacterStream({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const exec = useMemo(
		() => createSoapExec({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	useStreamLifecycle(realms);
	useStreamLifecycle(nodes);
	useStreamLifecycle(characters);
	const realmState = useStream(realms);
	const nodeState = useStream(nodes);
	const charState = useStream(characters);

	const counts = realmState.meta as WowRealmCounts | null;
	const realm = realmState.items[0];
	const notProvisioned =
		isNotProvisioned(realmState.error) || isNotProvisioned(charState.error);

	const stats = [
		{
			id: 'online',
			label: 'Online',
			tone: 'success' as const,
			value: counts?.online ?? charState.items.length,
		},
		{
			id: 'accounts',
			label: 'Accounts',
			tone: 'primary' as const,
			value: counts?.accounts ?? '—',
		},
		{
			id: 'banned',
			label: 'Banned',
			tone: (counts?.bannedAccounts ? 'danger' : 'neutral') as
				| 'danger'
				| 'neutral',
			value: counts?.bannedAccounts ?? '—',
		},
		{
			id: 'worldservers',
			label: 'Worldservers',
			value: nodeState.items.filter((n) => n.role === 'worldserver')
				.length,
		},
		{
			id: 'gateways',
			label: 'Gateways',
			value: nodeState.items.filter((n) => n.role === 'gateway').length,
		},
	];

	const refreshAll = () => {
		void realms.refresh();
		void nodes.refresh();
		void characters.refresh();
	};

	return (
		<Stack gap="md">
			<Stack direction="row" justify="space-between" align="center" gap="sm">
				<Stack direction="row" align="center" gap="sm">
					<Text variant="subtitle">
						{realm?.name ?? 'World of Warcraft Gameops'}
					</Text>
					{realm ? (
						<Badge
							label={realmTypeName(realm.icon)}
							tone={realm.icon === 1 ? 'danger' : 'primary'}
						/>
					) : null}
				</Stack>
				<Pressable onPress={refreshAll}>
					<Text variant="caption" tone="muted">
						{realmState.lastUpdated
							? `updated ${formatAgo(new Date(realmState.lastUpdated))}`
							: 'refresh'}
					</Text>
				</Pressable>
			</Stack>

			{notProvisioned ? (
				<Stack gap="xs">
					<Badge label="backend not provisioned" tone="warning" />
					<Text variant="caption" tone="muted">
						Realm and character data needs the MySQL credentials
						sealed into the cluster. Node metrics below still work.
					</Text>
				</Stack>
			) : realmState.error && realmState.items.length === 0 ? (
				<Text variant="caption" tone="muted">
					Realm status unavailable — {realmState.error}
				</Text>
			) : null}

			<StatGrid stats={stats} />

			{nodeState.error && nodeState.items.length === 0 ? (
				<Text variant="caption" tone="muted">
					Fleet metrics unavailable — {nodeState.error}
				</Text>
			) : (
				<View style={styles.grid}>
					{nodeState.items.map((item) => (
						<View key={item.id} style={styles.cell}>
							<NodeCard item={item} />
						</View>
					))}
				</View>
			)}

			{!notProvisioned && <CharacterTable characters={charState.items} />}

			<RconConsole
				server={realm?.name ?? 'worldserver'}
				exec={exec}
				commands={WOW_COMMANDS}
				protocolLabel="SOAP"
				resultCaveat={soapResultCaveat}
			/>
		</Stack>
	);
}

const styles = StyleSheet.create({
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: tokens.space.md,
	},
	cell: { flexGrow: 1, flexBasis: 320, maxWidth: '100%' },
});
