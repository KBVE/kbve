import { useEffect, useMemo, useRef, useState } from 'react';
import { Stack } from '../_ui';
import { StreamView } from '../StreamView';
import { EventDrawer } from './EventDrawer';
import { telemetryGroupsLens } from './telemetryLens';
import {
	METRICS_BASE,
	createTelemetryEventsStream,
	createTelemetryGroupsStream,
} from './telemetryStreams';

export interface TelemetryViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	pollMs?: number;
}

export function TelemetryView({
	getToken,
	baseUrl = METRICS_BASE,
	pollMs,
}: TelemetryViewProps) {
	const groups = useMemo(
		() => createTelemetryGroupsStream({ getToken, baseUrl, pollMs }),
		[getToken, baseUrl, pollMs],
	);
	const events = useMemo(
		() => createTelemetryEventsStream({ getToken, baseUrl }),
		[getToken, baseUrl],
	);

	const [fingerprint, setFingerprint] = useState<string | null>(null);
	// Guards the setParams call rather than the render: setParams refetches, and
	// the groups store notifies on every poll whether or not the selection moved.
	const lastRef = useRef<{ fingerprint: string | null; project: unknown }>({
		fingerprint: null,
		project: undefined,
	});

	useEffect(() => {
		const sync = () => {
			const state = groups.get();
			const expanded = state.expandedId
				? (state.items.find((it) => it.id === state.expandedId) ?? null)
				: null;
			// Resolved through the item rather than by splitting the id: the id is
			// `project:fingerprint` and a project name may itself contain a colon.
			const next = expanded ? expanded.fingerprint : null;
			const project = state.params['project'];
			const prev = lastRef.current;
			if (prev.fingerprint === next && prev.project === project) return;
			lastRef.current = { fingerprint: next, project };
			setFingerprint(next);
			events.setParams({ fingerprint: next ?? '', project });
		};
		sync();
		return groups.subscribe(sync);
	}, [groups, events]);

	return (
		<Stack gap="md">
			<StreamView
				store={groups}
				lens={telemetryGroupsLens}
				layout="rows"
				searchPlaceholder="filter by project / type / message"
			/>
			<EventDrawer store={events} fingerprint={fingerprint} />
		</Stack>
	);
}
