import { useEffect, useRef } from 'react';

export type StepStatus = 'todo' | 'pending' | 'done';

export function useStepCardStatus(status: StepStatus, disabled = false) {
	const anchorRef = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const root = anchorRef.current?.closest(
			'[data-stepcard-root]',
		) as HTMLElement | null;
		if (!root) return;
		root.dataset.status = status;
		root.dataset.disabled = disabled ? 'true' : 'false';
		const pill = root.querySelector('[data-slot="status"]');
		if (pill) pill.textContent = status;
	}, [status, disabled]);
	return anchorRef;
}
