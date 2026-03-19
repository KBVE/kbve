import { useRef, useEffect } from 'react';

interface ToggleSwitchProps {
	checked?: boolean;
	onChange?: (checked: boolean) => void;
}

// ─── ToggleSwitch ────────────────────────────────────────────────────────────
// Manages its own DOM state directly via refs. No React re-renders on toggle.

export function ToggleSwitch({ checked = false, onChange }: ToggleSwitchProps) {
	const btnRef = useRef<HTMLButtonElement>(null);
	const dotRef = useRef<HTMLSpanElement>(null);
	const stateRef = useRef(checked);

	useEffect(() => {
		// Sync if parent changes the prop
		if (stateRef.current !== checked) {
			stateRef.current = checked;
			applyVisual(checked);
		}
	}, [checked]);

	function applyVisual(on: boolean) {
		if (btnRef.current) {
			btnRef.current.style.backgroundColor = on
				? 'var(--color-accent)'
				: 'var(--color-border)';
		}
		if (dotRef.current) {
			dotRef.current.style.transform = on
				? 'translateX(20px)'
				: 'translateX(2px)';
		}
	}

	function handleClick() {
		const next = !stateRef.current;
		stateRef.current = next;
		applyVisual(next);
		onChange?.(next);
	}

	return (
		<button
			ref={btnRef}
			className="relative h-6 w-11 rounded-full transition-colors"
			style={{
				backgroundColor: checked
					? 'var(--color-accent)'
					: 'var(--color-border)',
			}}
			onClick={handleClick}>
			<span
				ref={dotRef}
				className="absolute top-1 block h-4 w-4 rounded-full bg-white shadow transition-transform"
				style={{
					transform: checked ? 'translateX(20px)' : 'translateX(2px)',
				}}
			/>
		</button>
	);
}
