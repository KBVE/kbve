import { useEffect } from 'react';
import { restoreSavedState, toggleSidebar } from './sidebar-state';

interface Props {
	side: 'left' | 'right';
	targetId: string;
}

export default function SidebarToggle({ side, targetId }: Props) {
	useEffect(() => {
		restoreSavedState(side);

		const btn = document.getElementById(targetId);
		if (!btn) return;

		const handler = () => toggleSidebar(side);
		btn.addEventListener('click', handler);
		return () => btn.removeEventListener('click', handler);
	}, [side, targetId]);

	return null;
}
