import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { forgejoService, timeAgo, type ForgejoPackage } from './forgejoService';
import {
	ActionButton,
	ConfirmDialog,
	SelectField,
	useTabActive,
	uiTokens,
	ForgejoNotice,
} from './forgejoUi';
import {
	Package,
	Trash2,
	ExternalLink,
	Loader2,
	RefreshCw,
} from 'lucide-react';

const { textColor, subText, border, panelBg } = uiTokens;

const th: React.CSSProperties = {
	padding: '0.55rem 0.75rem',
	textAlign: 'left',
	color: subText,
	fontWeight: 600,
	fontSize: '0.7rem',
	textTransform: 'uppercase',
	letterSpacing: '0.05em',
};
const td: React.CSSProperties = {
	padding: '0.55rem 0.75rem',
	fontSize: '0.82rem',
	color: textColor,
	borderBottom: border,
};

function typePill(type: string) {
	return (
		<span
			style={{
				display: 'inline-block',
				padding: '1px 6px',
				borderRadius: 4,
				fontSize: '0.62rem',
				fontWeight: 600,
				background: 'rgba(139,92,246,0.18)',
				color: '#a78bfa',
				textTransform: 'uppercase',
				letterSpacing: '0.04em',
			}}>
			{type}
		</span>
	);
}

export default function ReactForgejoPackages() {
	const active = useTabActive('packages');
	const orgs = useStore(forgejoService.$orgs);
	const users = useStore(forgejoService.$users);
	const owner = useStore(forgejoService.$packagesOwner);
	const packagesMap = useStore(forgejoService.$packages);
	const loading = useStore(forgejoService.$packagesLoading);
	const busy = useStore(forgejoService.$busy);
	const [target, setTarget] = useState<ForgejoPackage | null>(null);

	if (!active) return null;

	const packages = owner ? (packagesMap[owner] ?? []) : [];
	const owners = Array.from(
		new Set([...orgs.map((o) => o.username), ...users.map((u) => u.login)]),
	)
		.filter(Boolean)
		.sort();

	return (
		<div className="not-content">
			<ForgejoNotice
				ctx="packages"
				onRetry={() => owner && forgejoService.loadPackages(owner)}
			/>
			<div
				style={{
					display: 'flex',
					gap: 12,
					alignItems: 'flex-end',
					flexWrap: 'wrap',
					marginBottom: '1.25rem',
				}}>
				<div style={{ flex: '1 1 280px', maxWidth: 420 }}>
					<SelectField
						label="Owner"
						value={owner ?? ''}
						onChange={(v) => v && forgejoService.loadPackages(v)}
						options={[
							{ value: '', label: 'Select an owner…' },
							...owners.map((o) => ({ value: o, label: o })),
						]}
					/>
				</div>
				{owner && (
					<div style={{ marginBottom: '0.75rem' }}>
						<ActionButton
							size="sm"
							onClick={() => forgejoService.loadPackages(owner)}>
							<RefreshCw size={12} /> Refresh
						</ActionButton>
					</div>
				)}
			</div>

			{!owner && (
				<span style={{ color: subText, fontSize: '0.85rem' }}>
					Choose an owner to inspect their published packages.
				</span>
			)}

			{owner && loading && packages.length === 0 && (
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						padding: '2rem',
					}}>
					<Loader2
						size={22}
						style={{
							animation: 'spin 1s linear infinite',
							color: 'var(--sl-color-accent, #06b6d4)',
						}}
					/>
				</div>
			)}

			{owner && (!loading || packages.length > 0) && (
				<div style={{ borderRadius: 10, border, overflow: 'hidden' }}>
					<table
						style={{ width: '100%', borderCollapse: 'collapse' }}>
						<thead>
							<tr style={{ background: panelBg }}>
								<th style={th}>Type</th>
								<th style={th}>Name</th>
								<th style={th}>Version</th>
								<th style={th}>Created</th>
								<th style={{ ...th, textAlign: 'right' }}>
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{packages.map((p) => (
								<tr key={p.id}>
									<td style={td}>{typePill(p.type)}</td>
									<td style={td}>
										<div
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 8,
											}}>
											<Package
												size={13}
												style={{ color: subText }}
											/>
											<span style={{ fontWeight: 500 }}>
												{p.name}
											</span>
										</div>
									</td>
									<td style={{ ...td, color: subText }}>
										{p.version}
									</td>
									<td
										style={{
											...td,
											color: subText,
											fontSize: '0.72rem',
										}}>
										{p.created_at &&
										!p.created_at.startsWith('0001')
											? timeAgo(p.created_at)
											: '—'}
									</td>
									<td style={{ ...td, textAlign: 'right' }}>
										<div
											style={{
												display: 'inline-flex',
												gap: 4,
											}}>
											{p.html_url && (
												<a
													href={p.html_url}
													target="_blank"
													rel="noreferrer"
													style={{
														color: subText,
														display: 'flex',
														alignItems: 'center',
													}}
													title="Open in Forgejo">
													<ExternalLink size={13} />
												</a>
											)}
											<ActionButton
												size="sm"
												variant="danger"
												title="Delete version"
												onClick={() => setTarget(p)}>
												<Trash2 size={12} />
											</ActionButton>
										</div>
									</td>
								</tr>
							))}
							{!loading && packages.length === 0 && (
								<tr>
									<td
										style={{
											...td,
											color: subText,
											textAlign: 'center',
										}}
										colSpan={5}>
										No packages published by {owner}.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}

			{target && owner && (
				<ConfirmDialog
					title="Delete package version"
					message={`Delete ${target.type} package ${target.name}@${target.version}? This cannot be undone.`}
					confirmLabel="Delete"
					danger
					loading={
						busy ===
						`pkg-delete-${owner}-${target.type}-${target.name}-${target.version}`
					}
					onCancel={() => setTarget(null)}
					onConfirm={async () => {
						const ok = await forgejoService.deletePackage(
							owner,
							target,
						);
						if (ok) setTarget(null);
					}}
				/>
			)}
		</div>
	);
}
