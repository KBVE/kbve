import { useStore } from '@nanostores/react';
import { forgejoService, type ForgejoOrg } from './forgejoService';
import { Building2, Eye, EyeOff } from 'lucide-react';

function OrgCard({ org }: { org: ForgejoOrg }) {
	const isPublic = org.visibility === 'public';

	return (
		<div
			style={{
				padding: '0.75rem',
				borderRadius: 10,
				background: 'var(--sl-color-gray-6, #161b22)',
				border: '1px solid var(--sl-color-gray-5, #30363d)',
				display: 'flex',
				gap: 10,
				alignItems: 'center',
			}}>
			<img
				src={org.avatar_url}
				alt={org.username}
				style={{
					width: 36,
					height: 36,
					borderRadius: 8,
					flexShrink: 0,
					background: 'var(--sl-color-gray-5, #30363d)',
				}}
			/>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 4,
					}}>
					<span
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							fontWeight: 600,
							fontSize: '0.8rem',
						}}>
						{org.username}
					</span>
					{isPublic ? (
						<Eye
							size={11}
							style={{
								color: '#22c55e',
								flexShrink: 0,
							}}
						/>
					) : (
						<EyeOff
							size={11}
							style={{
								color: '#f59e0b',
								flexShrink: 0,
							}}
						/>
					)}
				</div>
				{org.description && (
					<div
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.7rem',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}>
						{org.description}
					</div>
				)}
			</div>
		</div>
	);
}

export default function ReactForgejoOrgCards() {
	const orgs = useStore(forgejoService.$orgs);

	if (orgs.length === 0) return null;

	return (
		<div className="not-content" style={{ marginTop: '1.5rem' }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 4,
					fontSize: '0.75rem',
					fontWeight: 600,
					color: 'var(--sl-color-gray-3, #8b949e)',
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					marginBottom: 10,
				}}>
				<Building2 size={12} />
				Organizations
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						'repeat(auto-fill, minmax(240px, 1fr))',
					gap: '0.6rem',
				}}>
				{orgs.map((o) => (
					<OrgCard key={o.id} org={o} />
				))}
			</div>
		</div>
	);
}
