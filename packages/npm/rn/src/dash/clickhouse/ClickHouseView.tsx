import { useEffect, useMemo, useRef } from 'react';
import { Stack } from '../_ui';
import { StreamView } from '../StreamView';
import { clickhouseLens } from '../adapters/clickhouse';
import { createClickHouseStream } from './clickhouseStream';
import { createErrorGroupsStream } from './errorGroupsStream';
import { makeNamespaceGrid } from './NamespaceGrid';
import { ErrorDigest } from './ErrorDigest';
import { SectionDivider } from '../shared';

export interface ClickHouseViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export function ClickHouseView({
	getToken,
	baseUrl = '',
}: ClickHouseViewProps) {
	const primary = useMemo(
		() => createClickHouseStream({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const errors = useMemo(
		() => createErrorGroupsStream({ getToken, baseUrl }),
		[getToken, baseUrl],
	);

	// Keep the error-groups window in sync with the primary time range + namespace.
	const lastSyncRef = useRef<{ minutes: unknown; pod_namespace: unknown }>({
		minutes: undefined,
		pod_namespace: undefined,
	});
	useEffect(() => {
		const unsub = primary.subscribe(() => {
			const p = primary.get().params;
			const minutes = p['minutes'];
			const pod_namespace = p['pod_namespace'];
			const prev = lastSyncRef.current;
			if (
				prev.minutes === minutes &&
				prev.pod_namespace === pod_namespace
			)
				return;
			lastSyncRef.current = { minutes, pod_namespace };
			errors.setParams({ minutes, pod_namespace });
		});
		return unsub;
	}, [primary, errors]);

	const lens = useMemo(() => {
		const grid = makeNamespaceGrid(primary);
		return {
			...clickhouseLens,
			metaPanel: (meta: unknown) => {
				const panel = grid(meta);
				if (!panel) return null;
				return (
					<Stack gap="xs">
						<SectionDivider label="Namespaces" />
						{panel}
					</Stack>
				);
			},
		};
	}, [primary]);

	return (
		<Stack gap="md">
			<StreamView
				store={primary}
				lens={lens}
				layout="rows"
				searchPlaceholder="filter by namespace / level / message"
			/>
			<ErrorDigest store={errors} primary={primary} />
		</Stack>
	);
}
