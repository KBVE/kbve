import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $activeTooltip, openTooltip, closeTooltip } from '@kbve/droid';

export function useTooltip() {
	const activeTooltipId = useStore($activeTooltip);

	const isOpen = useCallback(
		(id: string) => activeTooltipId === id,
		[activeTooltipId],
	);
	const open = useCallback((id: string) => openTooltip(id), []);
	const close = useCallback((id?: string) => closeTooltip(id), []);

	return { activeTooltipId, isOpen, open, close };
}
