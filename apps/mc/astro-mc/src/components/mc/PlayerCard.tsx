import { useRef, useCallback, type CSSProperties } from 'react';
import PlayerAvatar from './PlayerAvatar';
import type { MojangProfile } from '../../lib/mojang';

export interface PlayerCardProps {
	profile: MojangProfile;
	skinDataUrl: string | null;
	onHoverStart: (rect: DOMRect, profile: MojangProfile) => void;
	onHoverEnd: () => void;
	onClick: (profile: MojangProfile) => void;
}

const cardStyle: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: '0.5rem',
	padding: '0.5rem 0.75rem',
	borderRadius: '0.375rem',
	background: 'var(--sl-color-bg, rgba(0, 0, 0, 0.15))',
	border: '1px solid var(--sl-color-hairline, #27272a)',
	cursor: 'pointer',
	transition: 'border-color 150ms ease, background 150ms ease',
	userSelect: 'none',
};

const nameStyle: CSSProperties = {
	fontSize: '0.8125rem',
	fontWeight: 500,
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};

export default function PlayerCard({
	profile,
	skinDataUrl,
	onHoverStart,
	onHoverEnd,
	onClick,
}: PlayerCardProps) {
	const ref = useRef<HTMLDivElement>(null);

	const handleMouseEnter = useCallback(() => {
		if (ref.current) {
			onHoverStart(ref.current.getBoundingClientRect(), profile);
		}
	}, [onHoverStart, profile]);

	const handleClick = useCallback(() => {
		onClick(profile);
	}, [onClick, profile]);

	return (
		<div
			ref={ref}
			style={cardStyle}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={onHoverEnd}
			onClick={handleClick}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') handleClick();
			}}>
			<PlayerAvatar skinDataUrl={skinDataUrl} size={24} />
			<span style={nameStyle}>{profile.name}</span>
		</div>
	);
}
