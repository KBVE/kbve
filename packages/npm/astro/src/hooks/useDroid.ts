import { useEffect, useState } from 'react';
import { droid } from '@kbve/droid';

export interface DroidState {
	initialized: boolean;
	hasApi: boolean;
	hasUiux: boolean;
	hasWs: boolean;
	hasEvents: boolean;
	error: string | null;
}

const initialState: DroidState = {
	initialized: false,
	hasApi: false,
	hasUiux: false,
	hasWs: false,
	hasEvents: false,
	error: null,
};

export function useDroid(
	workerURLs?: Record<string, string>,
	i18nPath?: string,
	dataPath?: string,
): DroidState {
	const [state, setState] = useState<DroidState>(initialState);

	useEffect(() => {
		let cancelled = false;

		async function init() {
			try {
				const result = await droid({
					workerURLs,
					i18nPath,
					dataPath,
				});
				if (cancelled) return;

				const kbve = (window as any).kbve;
				setState({
					initialized: result.initialized,
					hasApi: !!kbve?.api,
					hasUiux: !!kbve?.uiux,
					hasWs: !!kbve?.ws,
					hasEvents: !!kbve?.events,
					error: null,
				});
			} catch (err) {
				if (cancelled) return;
				setState((prev) => ({
					...prev,
					error: err instanceof Error ? err.message : String(err),
				}));
			}
		}

		init();
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}
