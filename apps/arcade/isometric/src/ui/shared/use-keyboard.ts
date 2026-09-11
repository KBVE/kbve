import { useEffect } from 'react';

export function useKeyboard(
	key: string,
	handler: () => void,
	enabled = true,
): void {
	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === key) {
				e.preventDefault();
				handler();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [key, handler, enabled]);
}
