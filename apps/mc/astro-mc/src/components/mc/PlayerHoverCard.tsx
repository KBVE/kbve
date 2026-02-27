import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import PlayerAvatar from './PlayerAvatar';

export interface PlayerHoverCardProps {
	visible: boolean;
	anchorRect: DOMRect | null;
	name: string;
	uuid: string | null;
	skinDataUrl: string | null;
}

export default function PlayerHoverCard({
	visible,
	anchorRect,
	name,
	uuid,
	skinDataUrl,
}: PlayerHoverCardProps) {
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useEffect(() => {
		if (!visible || !anchorRect) {
			setPos(null);
			return;
		}
		setPos({
			top: anchorRect.bottom + 8 + window.scrollY,
			left: anchorRect.left + anchorRect.width / 2 + window.scrollX,
		});
	}, [visible, anchorRect]);

	const show = visible && pos;

	const style: CSSProperties = {
		position: 'absolute',
		zIndex: 9997,
		padding: '12px 16px',
		borderRadius: 10,
		backgroundColor: 'var(--sl-color-gray-6, #18181b)',
		color: 'var(--sl-color-text, #e4e4e7)',
		fontSize: '0.8125rem',
		boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
		border: '1px solid var(--sl-color-hairline, #27272a)',
		transform: 'translateX(-50%)',
		transition: 'opacity 120ms ease',
		pointerEvents: 'none',
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		...(show
			? {
					opacity: 1,
					visibility: 'visible' as const,
					top: pos.top,
					left: pos.left,
				}
			: {
					opacity: 0,
					visibility: 'hidden' as const,
					top: -9999,
					left: -9999,
				}),
	};

	const truncatedUuid = uuid
		? `${uuid.slice(0, 8)}...${uuid.slice(-4)}`
		: null;

	return createPortal(
		<div role="tooltip" aria-hidden={!visible} style={style}>
			<PlayerAvatar skinDataUrl={skinDataUrl} size={40} />
			<div>
				<div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
					{name}
				</div>
				{truncatedUuid && (
					<div
						style={{
							fontSize: '0.6875rem',
							color: 'var(--sl-color-gray-3, #71717a)',
							fontFamily: 'monospace',
							marginTop: 2,
						}}>
						{truncatedUuid}
					</div>
				)}
			</div>
		</div>,
		document.body,
	);
}
