import type { CSSProperties } from 'react';
import type { AdCreative } from './types';

const ACCENT = '#6ea8ff';

export interface AdCardProps {
	creative: AdCreative;
	/**
	 * Click override. Discord Activities can't open a bare new tab — the host
	 * passes this to route through the embedded SDK's openExternalLink instead.
	 * When set, default anchor navigation is suppressed.
	 */
	onOpen?: (creative: AdCreative) => void;
	style?: CSSProperties;
	className?: string;
}

/**
 * Renders one {@link AdCreative} as a compact clickable card. Pure inline styles
 * so it drops onto any boot/loading screen (Phaser canvas overlay, React shell)
 * without a stylesheet. Content-agnostic: every label comes from the creative.
 */
export function AdCard({ creative, onOpen, style, className }: AdCardProps) {
	const accent = creative.accent ?? ACCENT;
	return (
		<a
			href={creative.url}
			target="_blank"
			rel="noopener noreferrer"
			className={className}
			onClick={
				onOpen
					? (e) => {
							e.preventDefault();
							onOpen(creative);
						}
					: undefined
			}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '12px',
				maxWidth: '320px',
				padding: '10px 14px',
				borderRadius: '8px',
				border: `1px solid ${accent}59`,
				background:
					'linear-gradient(135deg, rgba(20,26,40,0.9), rgba(34,24,48,0.9))',
				textDecoration: 'none',
				color: '#e6ebf5',
				boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
				...style,
			}}>
			<span
				aria-hidden="true"
				style={{
					flex: '0 0 auto',
					width: '38px',
					height: '38px',
					borderRadius: '8px',
					overflow: 'hidden',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: '20px',
					background: `radial-gradient(120% 120% at 30% 20%, ${accent}, #7c3aed)`,
				}}>
				{creative.imageUrl ? (
					<img
						src={creative.imageUrl}
						alt=""
						style={{
							width: '100%',
							height: '100%',
							objectFit: 'cover',
						}}
						onError={(e) => {
							(
								e.currentTarget as HTMLImageElement
							).style.display = 'none';
						}}
					/>
				) : (
					(creative.icon ?? '★')
				)}
			</span>
			<span
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: '2px',
					minWidth: 0,
				}}>
				{creative.eyebrow ? (
					<span
						style={{
							fontSize: '9px',
							letterSpacing: 1.4,
							textTransform: 'uppercase',
							color: '#9fb3d8',
						}}>
						{creative.eyebrow}
					</span>
				) : null}
				<span style={{ fontSize: '13px', fontWeight: 700 }}>
					{creative.title}
					{creative.highlight ? (
						<>
							{' '}
							<span
								style={{
									color:
										accent === ACCENT ? '#fcd34d' : accent,
								}}>
								{creative.highlight}
							</span>
						</>
					) : null}
				</span>
				{creative.body ? (
					<span style={{ fontSize: '11px', color: '#9fb3d8' }}>
						{creative.body}
					</span>
				) : null}
			</span>
		</a>
	);
}

export default AdCard;
