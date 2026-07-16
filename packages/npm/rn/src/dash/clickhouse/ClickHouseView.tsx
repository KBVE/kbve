import { useEffect, useMemo } from 'react';
import { Stack } from '../_ui';
import { StreamView } from '../StreamView';
import { clickhouseLens } from '../adapters/clickhouse';
import { createClickHouseStream } from './clickhouseStream';
import { createErrorGroupsStream } from './errorGroupsStream';
import { makeNamespaceGrid } from './NamespaceGrid';
import { ErrorDigest } from './ErrorDigest';

export interface ClickHouseViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export function ClickHouseView({ getToken, baseUrl = '' }: ClickHouseViewProps) {
	const primary = useMemo(() => createClickHouseStream({ getToken, baseUrl }), [getToken, baseUrl]);
	const errors = useMemo(() => createErrorGroupsStream({ getToken, baseUrl }), [getToken, baseUrl]);

	// Keep the error-groups window in sync with the primary time range + namespace.
	useEffect(() => {
		const unsub = primary.subscribe(() => {
			const p = primary.get().params;
			errors.setParams({ minutes: p['minutes'], pod_namespace: p['pod_namespace'] });
		});
		return unsub;
	}, [primary, errors]);

	const lens = useMemo(() => ({ ...clickhouseLens, metaPanel: makeNamespaceGrid(primary) }), [primary]);

	return (
		<Stack gap="md">
			<StreamView store={primary} lens={lens} layout="rows" searchPlaceholder="filter by namespace / level / message" />
			<ErrorDigest store={errors} primary={primary} />
		</Stack>
	);
}
