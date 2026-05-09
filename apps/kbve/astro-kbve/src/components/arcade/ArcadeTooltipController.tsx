import { useEffect, useState } from 'react';
import {
	TooltipOverlay,
	openTooltip,
	closeTooltip,
	useTooltip,
} from '@kbve/astro';

const NOOP_ID = '__arcade-tooltip-noop__';

export default function ArcadeTooltipController() {
	const [anchorId, setAnchorId] = useState<string | null>(null);
	const [content, setContent] = useState<string>('');
	useTooltip();

	useEffect(() => {
		const cards =
			document.querySelectorAll<HTMLElement>('[data-arcade-card]');
		const cleanups: Array<() => void> = [];

		cards.forEach((card) => {
			const id = card.id;
			const tip = card.dataset.arcadeTooltip ?? '';
			if (!id || !tip) return;

			const onEnter = () => {
				setAnchorId(id);
				setContent(tip);
				openTooltip(id);
				if (typeof window !== 'undefined' && window.eventEngine) {
					window.eventEngine.emit('ui:tooltip:show', 'arcade', {
						id,
						content: tip,
					});
				}
			};
			const onLeave = () => {
				closeTooltip(id);
			};

			card.addEventListener('mouseenter', onEnter);
			card.addEventListener('mouseleave', onLeave);
			card.addEventListener('focusin', onEnter);
			card.addEventListener('focusout', onLeave);

			cleanups.push(() => {
				card.removeEventListener('mouseenter', onEnter);
				card.removeEventListener('mouseleave', onLeave);
				card.removeEventListener('focusin', onEnter);
				card.removeEventListener('focusout', onLeave);
			});
		});

		return () => cleanups.forEach((fn) => fn());
	}, []);

	return (
		<TooltipOverlay
			id={anchorId ?? NOOP_ID}
			anchorId={anchorId ?? undefined}
			className="max-w-xs whitespace-pre-line text-sm leading-relaxed"
			content={content}
		/>
	);
}
