import { useActiveInteract } from './registry';

// Verb-driven [F] prompt: shows whatever the nearest interactable named (unlock
// the door, mine the rock, ...). Presentation only; targeting lives in registry.
export function InteractPrompt() {
	const active = useActiveInteract();
	if (!active) return null;
	return (
		<div
			style={{
				position: 'fixed',
				left: '50%',
				top: '58%',
				transform: 'translate(-50%, 0)',
				padding: '8px 16px',
				background: 'rgba(10,10,14,0.82)',
				border: '1px solid #5a4a32',
				borderRadius: 6,
				color: '#e8dcc0',
				font: '13px monospace',
				letterSpacing: 0.4,
				pointerEvents: 'none',
				textShadow: '0 1px 2px #000',
			}}>
			Press{' '}
			<span
				style={{
					padding: '1px 6px',
					margin: '0 2px',
					background: '#2a2418',
					border: '1px solid #6b5836',
					borderRadius: 4,
					color: '#ffe9b0',
				}}>
				F
			</span>{' '}
			to {active.verb}
		</div>
	);
}
