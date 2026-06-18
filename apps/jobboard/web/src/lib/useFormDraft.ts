import { useEffect, useRef } from 'react';
import type { FieldValues, UseFormReset, UseFormWatch } from 'react-hook-form';
import { createWorkerPool } from '@kbve/rn';

// Auto-persist a react-hook-form's values to IndexedDB through the @kbve/rn
// worker (the tab's sole IndexedDB writer) so a half-filled form survives a
// reload and refills itself. Restores once on mount, debounce-saves on change,
// and exposes clearDraft() to drop the saved copy after a successful submit.
//
// Persistence is keyed by `key` (the form id) and stores the whole RHF values
// object — no per-field DOM wiring; restore goes through reset() so controlled
// inputs and field arrays stay consistent.

const pool = createWorkerPool();

interface FormDraftOptions<T extends FieldValues> {
	key: string;
	watch: UseFormWatch<T>;
	reset: UseFormReset<T>;
	defaults: T;
	enabled?: boolean;
	debounceMs?: number;
}

export function useFormDraft<T extends FieldValues>({
	key,
	watch,
	reset,
	defaults,
	enabled = true,
	debounceMs = 400,
}: FormDraftOptions<T>): { clearDraft: () => void } {
	const cleared = useRef(false);

	useEffect(() => {
		if (!enabled) return;
		let active = true;
		pool.cacheGet<Partial<T>>(key).then((saved) => {
			if (active && saved && !cleared.current) {
				reset({ ...defaults, ...saved });
			}
		});
		return () => {
			active = false;
		};
		// defaults is a stable literal from the caller; key identifies the form.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, enabled]);

	useEffect(() => {
		if (!enabled) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const sub = watch((values) => {
			if (cleared.current) return;
			clearTimeout(timer);
			timer = setTimeout(() => {
				void pool.cacheSet(key, values);
			}, debounceMs);
		});
		return () => {
			clearTimeout(timer);
			sub.unsubscribe();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, enabled, debounceMs]);

	const clearDraft = () => {
		cleared.current = true;
		void pool.cacheRemove(key);
	};

	return { clearDraft };
}
