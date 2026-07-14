import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	forgejoService,
	timeAgo,
	type ForgejoIssue,
	type PullMergeMethod,
} from './forgejoService';
import {
	ActionButton,
	SelectField,
	TextField,
	Toggle,
	useForm,
	useTabActive,
	uiTokens,
	ForgejoNotice,
} from './forgejoUi';
import {
	CircleDot,
	GitPullRequest,
	GitMerge,
	Lock,
	Unlock,
	CheckCircle2,
	RotateCcw,
	MessageSquare,
	ExternalLink,
	Loader2,
	ChevronDown,
	ChevronRight,
	Tag,
	Milestone,
	Plus,
	Pencil,
	Trash2,
	Send,
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

function sectionLabel(text: string) {
	return (
		<div
			style={{
				fontSize: '0.7rem',
				fontWeight: 600,
				color: subText,
				textTransform: 'uppercase',
				letterSpacing: '0.04em',
				marginBottom: 8,
			}}>
			{text}
		</div>
	);
}

function TriageManager({ repo }: { repo: string }) {
	const labelsMap = useStore(forgejoService.$repoLabels);
	const milestonesMap = useStore(forgejoService.$repoMilestones);
	const busy = useStore(forgejoService.$busy);
	const [open, setOpen] = useState(false);
	const labelForm = useForm({ name: '', color: '#06b6d4', description: '' });
	const milestoneForm = useForm({ title: '', description: '' });
	const labels = labelsMap[repo] ?? [];
	const milestones = milestonesMap[repo] ?? [];

	return (
		<div
			style={{
				border,
				borderRadius: 10,
				background: panelBg,
				marginBottom: '1.25rem',
			}}>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					width: '100%',
					padding: '0.7rem 0.9rem',
					background: 'transparent',
					border: 'none',
					color: textColor,
					cursor: 'pointer',
					fontSize: '0.85rem',
					fontWeight: 600,
				}}>
				{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
				<Tag size={14} style={{ color: subText }} />
				Labels &amp; milestones
				<span style={{ color: subText, fontWeight: 400 }}>
					{labels.length} labels · {milestones.length} milestones
				</span>
			</button>
			{open && (
				<div
					style={{
						display: 'grid',
						gap: 16,
						gridTemplateColumns:
							'repeat(auto-fit, minmax(260px, 1fr))',
						padding: '0 0.9rem 0.9rem',
					}}>
					<div>
						{sectionLabel('Labels')}
						<div
							style={{
								display: 'flex',
								flexWrap: 'wrap',
								gap: 6,
								marginBottom: 10,
							}}>
							{labels.map((l) => (
								<span
									key={l.id}
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 5,
										padding: '2px 6px 2px 8px',
										borderRadius: 12,
										fontSize: '0.72rem',
										fontWeight: 600,
										background: `#${l.color}22`,
										color: `#${l.color}`,
										border: `1px solid #${l.color}55`,
									}}>
									{l.name}
									<button
										type="button"
										title="Delete label"
										disabled={
											busy === `label-delete-${l.id}`
										}
										onClick={() =>
											forgejoService.deleteLabel(l.id)
										}
										style={{
											display: 'flex',
											background: 'transparent',
											border: 'none',
											color: 'inherit',
											cursor: 'pointer',
											opacity: 0.7,
										}}>
										<Trash2 size={11} />
									</button>
								</span>
							))}
							{labels.length === 0 && (
								<span
									style={{
										color: subText,
										fontSize: '0.78rem',
									}}>
									No labels.
								</span>
							)}
						</div>
						<div style={{ display: 'flex', gap: 8 }}>
							<input
								type="color"
								value={labelForm.state.color}
								onChange={(e) =>
									labelForm.set('color', e.target.value)
								}
								style={{
									width: 34,
									height: 34,
									padding: 0,
									border,
									borderRadius: 7,
									background: 'transparent',
									cursor: 'pointer',
								}}
							/>
							<input
								value={labelForm.state.name}
								onChange={(e) =>
									labelForm.set('name', e.target.value)
								}
								placeholder="label name"
								style={{
									flex: 1,
									padding: '0.4rem 0.6rem',
									borderRadius: 7,
									border,
									background: 'var(--sl-color-bg, #0d1117)',
									color: textColor,
									fontSize: '0.8rem',
								}}
							/>
							<ActionButton
								size="sm"
								variant="primary"
								disabled={!labelForm.state.name}
								loading={busy === `label-create-${repo}`}
								onClick={async () => {
									const ok = await forgejoService.createLabel(
										{
											name: labelForm.state.name,
											color: labelForm.state.color.replace(
												'#',
												'',
											),
											description:
												labelForm.state.description,
										},
									);
									if (ok) labelForm.reset();
								}}>
								<Plus size={12} />
							</ActionButton>
						</div>
					</div>

					<div>
						{sectionLabel('Milestones')}
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 6,
								marginBottom: 10,
							}}>
							{milestones.map((m) => (
								<div
									key={m.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										fontSize: '0.8rem',
										color: textColor,
									}}>
									<Milestone
										size={12}
										style={{
											color:
												m.state === 'closed'
													? '#8b5cf6'
													: '#22c55e',
										}}
									/>
									<span style={{ flex: 1 }}>{m.title}</span>
									<span
										style={{
											color: subText,
											fontSize: '0.7rem',
										}}>
										{m.open_issues}/
										{m.open_issues + m.closed_issues}
									</span>
									<button
										type="button"
										title="Delete milestone"
										disabled={
											busy === `milestone-delete-${m.id}`
										}
										onClick={() =>
											forgejoService.deleteMilestone(m.id)
										}
										style={{
											display: 'flex',
											background: 'transparent',
											border: 'none',
											color: '#ef4444',
											cursor: 'pointer',
											opacity: 0.8,
										}}>
										<Trash2 size={11} />
									</button>
								</div>
							))}
							{milestones.length === 0 && (
								<span
									style={{
										color: subText,
										fontSize: '0.78rem',
									}}>
									No milestones.
								</span>
							)}
						</div>
						<div style={{ display: 'flex', gap: 8 }}>
							<input
								value={milestoneForm.state.title}
								onChange={(e) =>
									milestoneForm.set('title', e.target.value)
								}
								placeholder="milestone title"
								style={{
									flex: 1,
									padding: '0.4rem 0.6rem',
									borderRadius: 7,
									border,
									background: 'var(--sl-color-bg, #0d1117)',
									color: textColor,
									fontSize: '0.8rem',
								}}
							/>
							<ActionButton
								size="sm"
								variant="primary"
								disabled={!milestoneForm.state.title}
								loading={busy === `milestone-create-${repo}`}
								onClick={async () => {
									const ok =
										await forgejoService.createMilestone({
											title: milestoneForm.state.title,
											description:
												milestoneForm.state.description,
										});
									if (ok) milestoneForm.reset();
								}}>
								<Plus size={12} />
							</ActionButton>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function IssueComments({ index }: { index: number }) {
	const commentsMap = useStore(forgejoService.$issueComments);
	const busy = useStore(forgejoService.$busy);
	const { state, set, reset } = useForm({ body: '' });
	const comments = commentsMap[index];

	useEffect(() => {
		void forgejoService.loadIssueComments(index);
	}, [index]);

	return (
		<div
			style={{
				padding: '0.75rem 0.85rem 0.85rem 2.6rem',
				borderTop: border,
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
			}}>
			{comments === undefined ? (
				<Loader2
					size={15}
					style={{
						animation: 'spin 1s linear infinite',
						color: subText,
					}}
				/>
			) : (
				comments.map((c) => (
					<div
						key={c.id}
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 2,
							padding: '0.5rem 0.65rem',
							borderRadius: 7,
							border,
							background: 'var(--sl-color-bg, #0d1117)',
						}}>
						<div
							style={{
								display: 'flex',
								gap: 8,
								fontSize: '0.7rem',
								color: subText,
							}}>
							<span style={{ fontWeight: 600 }}>
								@{c.user?.login ?? 'unknown'}
							</span>
							<span>{timeAgo(c.created_at)}</span>
						</div>
						<div
							style={{
								color: textColor,
								fontSize: '0.8rem',
								whiteSpace: 'pre-wrap',
								wordBreak: 'break-word',
							}}>
							{c.body}
						</div>
					</div>
				))
			)}
			{comments && comments.length === 0 && (
				<span style={{ color: subText, fontSize: '0.78rem' }}>
					No comments.
				</span>
			)}
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
				<div style={{ flex: 1 }}>
					<TextField
						label=""
						value={state.body}
						onChange={(v) => set('body', v)}
						placeholder="Add a moderation comment…"
						textarea
					/>
				</div>
				<div style={{ marginBottom: '0.75rem' }}>
					<ActionButton
						variant="primary"
						disabled={!state.body.trim()}
						loading={busy === `issue-comment-${index}`}
						onClick={async () => {
							const ok = await forgejoService.addIssueComment(
								index,
								state.body,
							);
							if (ok) reset();
						}}>
						<Send size={13} /> Comment
					</ActionButton>
				</div>
			</div>
		</div>
	);
}

const MERGE_METHODS: { value: PullMergeMethod; label: string }[] = [
	{ value: 'squash', label: 'Squash' },
	{ value: 'merge', label: 'Merge commit' },
	{ value: 'rebase', label: 'Rebase' },
	{ value: 'rebase-merge', label: 'Rebase + merge' },
];

function branchRef(label: string): string {
	const slash = label.indexOf(':');
	return slash >= 0 ? label.slice(slash + 1) : label;
}

function PullActions({ index }: { index: number }) {
	const detailsMap = useStore(forgejoService.$pullDetails);
	const busy = useStore(forgejoService.$busy);
	const pull = detailsMap[index];
	const [method, setMethod] = useState<PullMergeMethod>('squash');
	const [deleteBranch, setDeleteBranch] = useState(false);
	const [editing, setEditing] = useState(false);
	const { state, set } = useForm({ title: '', body: '' });

	useEffect(() => {
		void forgejoService.loadPull(index);
	}, [index]);

	if (!pull) {
		return (
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					padding: '0.6rem 0.85rem 0.6rem 2.6rem',
					borderTop: border,
					color: subText,
					fontSize: '0.78rem',
				}}>
				<Loader2
					size={14}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
				Loading pull request…
			</div>
		);
	}

	const merging = busy === `pull-merge-${index}`;
	const startEdit = () => {
		set('title', pull.title);
		set('body', pull.body ?? '');
		setEditing(true);
	};

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 10,
				padding: '0.7rem 0.85rem 0.85rem 2.6rem',
				borderTop: border,
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					flexWrap: 'wrap',
					fontSize: '0.76rem',
					color: subText,
				}}>
				<span
					style={{
						fontFamily: 'monospace',
						color: textColor,
						background: 'var(--sl-color-bg, #0d1117)',
						border,
						borderRadius: 6,
						padding: '1px 6px',
					}}>
					{pull.base ? branchRef(pull.base.label) : 'base'}
				</span>
				<span>←</span>
				<span
					style={{
						fontFamily: 'monospace',
						color: textColor,
						background: 'var(--sl-color-bg, #0d1117)',
						border,
						borderRadius: 6,
						padding: '1px 6px',
					}}>
					{pull.head ? branchRef(pull.head.label) : 'head'}
				</span>
				{pull.merged ? (
					<span style={{ color: '#8b5cf6', fontWeight: 600 }}>
						merged
					</span>
				) : pull.state === 'open' ? (
					<span
						style={{
							color: pull.mergeable ? '#22c55e' : '#f59e0b',
							fontWeight: 600,
						}}>
						{pull.mergeable ? 'mergeable' : 'conflicts'}
					</span>
				) : (
					<span>closed</span>
				)}
			</div>

			{!pull.merged && pull.state === 'open' && (
				<div
					style={{
						display: 'flex',
						alignItems: 'flex-end',
						gap: 10,
						flexWrap: 'wrap',
					}}>
					<div style={{ width: 170 }}>
						<SelectField
							label="Method"
							value={method}
							onChange={(v) => setMethod(v as PullMergeMethod)}
							options={MERGE_METHODS}
						/>
					</div>
					<div style={{ marginBottom: '0.75rem' }}>
						<Toggle
							label="Delete branch after merge"
							checked={deleteBranch}
							onChange={setDeleteBranch}
						/>
					</div>
					<div style={{ marginBottom: '0.75rem' }}>
						<ActionButton
							variant="primary"
							disabled={!pull.mergeable}
							loading={merging}
							title={
								pull.mergeable
									? undefined
									: 'Pull request has conflicts'
							}
							onClick={() =>
								forgejoService.mergePull(
									index,
									method,
									deleteBranch,
								)
							}>
							<GitMerge size={13} /> Merge
						</ActionButton>
					</div>
				</div>
			)}

			{editing ? (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 6,
						padding: '0.7rem',
						borderRadius: 8,
						border,
					}}>
					<TextField
						label="Title"
						value={state.title}
						onChange={(v) => set('title', v)}
					/>
					<TextField
						label="Body"
						value={state.body}
						onChange={(v) => set('body', v)}
						textarea
					/>
					<div
						style={{
							display: 'flex',
							justifyContent: 'flex-end',
							gap: 8,
						}}>
						<ActionButton
							variant="ghost"
							onClick={() => setEditing(false)}>
							Cancel
						</ActionButton>
						<ActionButton
							variant="primary"
							disabled={!state.title.trim()}
							loading={busy === `pull-edit-${index}`}
							onClick={async () => {
								const ok = await forgejoService.editPull(
									index,
									{
										title: state.title,
										body: state.body,
									},
								);
								if (ok) setEditing(false);
							}}>
							Save
						</ActionButton>
					</div>
				</div>
			) : (
				<div>
					<ActionButton size="sm" onClick={startEdit}>
						<Pencil size={12} /> Edit title &amp; body
					</ActionButton>
				</div>
			)}
		</div>
	);
}

function IssueRow({ it }: { it: ForgejoIssue }) {
	const busy = useStore(forgejoService.$busy);
	const [expanded, setExpanded] = useState(false);
	const isPull = !!it.pull_request;
	const merged = !!it.pull_request?.merged;

	return (
		<div
			style={{
				borderRadius: 8,
				border,
				background: panelBg,
				overflow: 'hidden',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '0.6rem 0.8rem',
				}}>
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					title="Comments"
					style={{
						background: 'transparent',
						border: 'none',
						color: subText,
						cursor: 'pointer',
						display: 'flex',
						flexShrink: 0,
					}}>
					{expanded ? (
						<ChevronDown size={14} />
					) : (
						<ChevronRight size={14} />
					)}
				</button>
				{isPull ? (
					<GitPullRequest
						size={15}
						style={{
							color: it.state === 'open' ? '#22c55e' : '#8b5cf6',
							flexShrink: 0,
						}}
					/>
				) : (
					<CircleDot
						size={15}
						style={{
							color: it.state === 'open' ? '#22c55e' : '#6b7280',
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
						<span style={{ color: subText }}>#{it.number}</span>{' '}
						{it.title}
						{merged && (
							<span
								style={{
									marginLeft: 6,
									padding: '1px 6px',
									borderRadius: 4,
									fontSize: '0.62rem',
									fontWeight: 600,
									background: 'rgba(139,92,246,0.18)',
									color: '#a78bfa',
									textTransform: 'uppercase',
									letterSpacing: '0.04em',
									verticalAlign: 'middle',
								}}>
								merged
							</span>
						)}
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
						forgejoService.setIssueLock(it.number, !it.is_locked)
					}>
					{it.is_locked ? <Unlock size={12} /> : <Lock size={12} />}
				</ActionButton>
				{it.state === 'open' ? (
					<ActionButton
						size="sm"
						variant="danger"
						title="Close"
						loading={busy === `issue-state-${it.number}`}
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
						loading={busy === `issue-state-${it.number}`}
						onClick={() =>
							forgejoService.setIssueOpenState(it.number, 'open')
						}>
						<RotateCcw size={12} />
					</ActionButton>
				)}
			</div>
			{expanded && isPull && <PullActions index={it.number} />}
			{expanded && <IssueComments index={it.number} />}
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

	if (!active) return null;

	return (
		<div className="not-content">
			<ForgejoNotice
				ctx="issues"
				onRetry={() => forgejoService.loadIssues()}
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

			{selected && <TriageManager repo={selected} />}

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
					{issues.map((it) => (
						<IssueRow key={it.id} it={it} />
					))}
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
