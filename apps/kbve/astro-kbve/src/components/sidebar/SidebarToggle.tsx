import { useEffect } from 'react';
import { restoreSavedState, toggleSidebar } from './sidebar-state';

interface Props {
	side: 'left' | 'right';
	targetId: string;
}

export default function SidebarToggle({ side, targetId }: Props) {
	useEffect(() => {
		restoreSavedState(side);

		const handler = () => toggleSidebar(side);

		const btn = document.getElementById(targetId);
		if (btn) btn.addEventListener('click', handler);

		// Only attach top button listener for the left sidebar
		const topBtns =
			side === 'left'
				? document.querySelectorAll('.sl-sidebar-collapse-btn--top')
				: [];
		topBtns.forEach((b) => b.addEventListener('click', handler));

		return () => {
			if (btn) btn.removeEventListener('click', handler);
			topBtns.forEach((b) => b.removeEventListener('click', handler));
		};
	}, [side, targetId]);

	return null;
}
