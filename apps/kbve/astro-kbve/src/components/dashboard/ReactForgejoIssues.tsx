import { useStore } from '@nanostores/react';
import { forgejoService, timeAgo } from './forgejoService';
import { ActionButton, SelectField, useTabActive, uiTokens } from './forgejoUi';
import {
	CircleDot,
	GitPullRequest,
	Lock,
	Unlock,
	CheckCircle2,
	RotateCcw,
	MessageSquare,
	ExternalLink,
	Loader2,
} from 'lucide-react';

const { textColor, subText, border, panelBg } = uiTokens;

function Segmented({
	value,
	options,
	onChange,
}: {
	value: string;
	options: { value: string; label: string }[];
	onChange: (v: string) => void;
}) {
	return (
		<div
			style={{
				display: 'inline-flex',
				border,
				borderRadius: 8,
				overflow: 'hidden',
			}}>
			{options.map((o) => {
				const on = o.value === value;
				return (
					<button
						key={o.value}
						type="button"
						onClick={() => onChange(o.value)}
						style={{
							padding: '0.35rem 0.75rem',
							border: 'none',
							background: on
								? 'rgba(6, 182, 212, 0.13)'
								: 'transparent',
							color: on
								? 'var(--sl-color-accent, #06b6d4)'
								: subText,
							fontSize: '0.78rem',
							fontWeight: 600,
							cursor: 'pointer',
						}}>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

export default function ReactForgejoIssues() {
	const active = useTabActive('issues');
	const repos = useStore(forgejoService.$repos);
	const selected = useStore(forgejoService.$issueRepo);
	const issues = useStore(forgejoService.$issues);
	const state = useStore(forgejoService.$issueState);
	const type = useStore(forgejoService.$issueType);
	const loading = useStore(forgejoService.$issuesLoading);
	const busy = useStore(forgejoService.$busy);

	if (!active) return null;

	return (
		<div className="not-content">
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
						label="Repository"
						value={selected ?? ''}
						onChange={(v) => forgejoService.selectIssueRepo(v)}
						options={[
							{ value: '', label: 'Select a repository…' },
							...repos.map((r) => ({
								value: r.full_name,
								label: r.full_name,
							})),
						]}
					/>
				</div>
				<div style={{ marginBottom: '0.75rem' }}>
					<Segmented
						value={type}
						onChange={(v) =>
							forgejoService.setIssueType(v as 'issues' | 'pulls')
						}
						options={[
							{ value: 'issues', label: 'Issues' },
							{ value: 'pulls', label: 'Pull requests' },
						]}
					/>
				</div>
				<div style={{ marginBottom: '0.75rem' }}>
					<Segmented
						value={state}
						onChange={(v) =>
							forgejoService.setIssueState(v as 'open' | 'closed')
						}
						options={[
							{ value: 'open', label: 'Open' },
							{ value: 'closed', label: 'Closed' },
						]}
					/>
				</div>
			</div>

			{!selected && (
				<span style={{ color: subText, fontSize: '0.85rem' }}>
					Choose a repository to moderate its issues and pull
					requests.
				</span>
			)}

			{selected && loading && issues.length === 0 && (
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

			{selected && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 8,
					}}>
					{issues.map((it) => {
						const isPull = !!it.pull_request;
						return (
							<div
								key={it.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '0.6rem 0.8rem',
									borderRadius: 8,
									border,
									background: panelBg,
								}}>
								{isPull ? (
									<GitPullRequest
										size={15}
										style={{
											color:
												it.state === 'open'
													? '#22c55e'
													: '#8b5cf6',
											flexShrink: 0,
										}}
									/>
								) : (
									<CircleDot
										size={15}
										style={{
											color:
												it.state === 'open'
													? '#22c55e'
													: '#6b7280',
											flexShrink: 0,
										}}
									/>
								)}
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											color: textColor,
											fontSize: '0.85rem',
											fontWeight: 500,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}>
										<span style={{ color: subText }}>
											#{it.number}
										</span>{' '}
										{it.title}
										{it.is_locked && (
											<Lock
												size={11}
												style={{
													color: '#f59e0b',
													marginLeft: 6,
													verticalAlign: 'middle',
												}}
											/>
										)}
									</div>
									<div
										style={{
											color: subText,
											fontSize: '0.7rem',
											display: 'flex',
											gap: 10,
											marginTop: 2,
										}}>
										<span>@{it.user?.login}</span>
										<span>{timeAgo(it.created_at)}</span>
										{it.comments > 0 && (
											<span
												style={{
													display: 'inline-flex',
													alignItems: 'center',
													gap: 3,
												}}>
												<MessageSquare size={10} />
												{it.comments}
											</span>
										)}
									</div>
								</div>

								<a
									href={it.html_url}
									target="_blank"
									rel="noreferrer"
									style={{ color: subText, display: 'flex' }}
									title="Open in Forgejo">
									<ExternalLink size={13} />
								</a>
								<ActionButton
									size="sm"
									title={it.is_locked ? 'Unlock' : 'Lock'}
									loading={busy === `issue-lock-${it.number}`}
									onClick={() =>
										forgejoService.setIssueLock(
											it.number,
											!it.is_locked,
										)
									}>
									{it.is_locked ? (
										<Unlock size={12} />
									) : (
										<Lock size={12} />
									)}
								</ActionButton>
								{it.state === 'open' ? (
									<ActionButton
										size="sm"
										variant="danger"
										title="Close"
										loading={
											busy === `issue-state-${it.number}`
										}
										onClick={() =>
											forgejoService.setIssueOpenState(
												it.number,
												'closed',
											)
										}>
										<CheckCircle2 size={12} />
									</ActionButton>
								) : (
									<ActionButton
										size="sm"
										title="Reopen"
										loading={
											busy === `issue-state-${it.number}`
										}
										onClick={() =>
											forgejoService.setIssueOpenState(
												it.number,
												'open',
											)
										}>
										<RotateCcw size={12} />
									</ActionButton>
								)}
							</div>
						);
					})}
					{!loading && issues.length === 0 && (
						<span style={{ color: subText, fontSize: '0.85rem' }}>
							No {state}{' '}
							{type === 'pulls' ? 'pull requests' : 'issues'}.
						</span>
					)}
				</div>
			)}
		</div>
	);
}
