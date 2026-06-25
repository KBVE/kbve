import { useEffect, useRef, type CSSProperties } from 'react';
import type { NotificationEventData } from '@kbve/laser';
import { onNotification } from '../../systems/hud';

const DISMISS_MS = 2600;
const FADE_MS = 220;

const STACK_STYLE: CSSProperties = {
	position: 'absolute',
	top: '12%',
	left: '50%',
	transform: 'translateX(-50%)',
	display: 'flex',
	flexDirection: 'column',
	gap: '6px',
	alignItems: 'center',
	pointerEvents: 'none',
	zIndex: 50,
};

const TOAST_STYLE: Partial<CSSStyleDeclaration> = {
	fontFamily: 'monospace',
	fontSize: '15px',
	color: '#ffe7a8',
	background: 'rgba(16, 12, 8, 0.85)',
	border: '1px solid #6b5836',
	borderRadius: '4px',
	padding: '6px 12px',
	textAlign: 'center',
	textShadow: '0 1px 2px #000',
	maxWidth: '70vw',
};

export default function Toasts() {
	const hostRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		return onNotification((n) => spawnToast(host, n));
	}, []);

	return <div ref={hostRef} style={STACK_STYLE} />;
}

function spawnToast(host: HTMLElement, n: NotificationEventData) {
	const el = document.createElement('div');
	Object.assign(el.style, TOAST_STYLE);
	if (n.title) {
		const strong = document.createElement('strong');
		strong.textContent = `${n.title} — `;
		el.appendChild(strong);
	}
	el.appendChild(document.createTextNode(n.message ?? ''));
	host.appendChild(el);

	el.animate(
		[
			{ opacity: 0, transform: 'translateY(-4px)' },
			{ opacity: 1, transform: 'none' },
		],
		{ duration: FADE_MS, easing: 'ease-out' },
	);

	setTimeout(() => {
		const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], {
			duration: FADE_MS,
			easing: 'ease-in',
			fill: 'forwards',
		});
		fade.onfinish = () => el.remove();
	}, DISMISS_MS);
}
