import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { forgejoService, timeAgo } from './forgejoService';
import {
	ActionButton,
	Modal,
	ConfirmDialog,
	TextField,
	SelectField,
	Toggle,
	useForm,
	useTabActive,
	uiTokens,
} from './forgejoUi';
import {
	Plus,
	Trash2,
	Send,
	Webhook,
	Tag,
	CheckCircle2,
	XCircle,
} from 'lucide-react';

const { textColor, subText, border, panelBg } = uiTokens;

const HOOK_EVENTS = [
	'push',
	'pull_request',
	'issues',
	'release',
	'create',
	'delete',
];

const sectionTitle: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 6,
	fontSize: '0.8rem',
	fontWeight: 700,
	color: textColor,
	margin: '0 0 0.75rem',
};

function CreateHookModal({
	repo,
	onClose,
}: {
	repo: string;
	onClose: () => void;
}) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({
		url: '',
		content_type: 'json',
		secret: '',
		active: true,
		events: ['push'] as string[],
	});
	const toggleEvent = (ev: string) =>
		set(
			'events',
			state.events.includes(ev)
				? state.events.filter((e) => e !== ev)
				: [...state.events, ev],
		);
	const submit = async () => {
		const ok = await forgejoService.createHook(repo, {
			type: 'gitea',
			url: state.url,
			content_type: state.content_type,
			secret: state.secret,
			events: state.events,
			active: state.active,
		});
		if (ok) onClose();
	};
	return (
		<Modal
			title={`New webhook · ${repo}`}
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === `hook-create-${repo}`}
						disabled={!state.url || state.events.length === 0}>
						Create
					</ActionButton>
				</>
			}>
			<TextField
				label="Target URL"
				value={state.url}
				onChange={(v) => set('url', v)}
				placeholder="https://example.com/webhook"
			/>
			<SelectField
				label="Content type"
				value={state.content_type}
				onChange={(v) => set('content_type', v)}
				options={[
					{ value: 'json', label: 'application/json' },
					{ value: 'form', label: 'form-urlencoded' },
				]}
			/>
			<TextField
				label="Secret (optional)"
				value={state.secret}
				onChange={(v) => set('secret', v)}
				type="password"
			/>
			<span
				style={{
					display: 'block',
					fontSize: '0.72rem',
					fontWeight: 600,
					color: subText,
					margin: '0.25rem 0 6px',
					textTransform: 'uppercase',
					letterSpacing: '0.04em',
				}}>
				Events
			</span>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: 6,
					marginBottom: '0.75rem',
				}}>
				{HOOK_EVENTS.map((ev) => {
					const on = state.events.includes(ev);
					return (
						<button
							key={ev}
							type="button"
							onClick={() => toggleEvent(ev)}
							style={{
								padding: '0.25rem 0.55rem',
								borderRadius: 6,
								border,
								background: on
									? `${uiTokens.accent}22`
									: 'transparent',
								color: on ? uiTokens.accent : subText,
								fontSize: '0.72rem',
								fontWeight: 600,
								cursor: 'pointer',
							}}>
							{ev}
						</button>
					);
				})}
			</div>
			<Toggle
				label="Active"
				checked={state.active}
				onChange={(v) => set('active', v)}
			/>
		</Modal>
	);
}

function CreateReleaseModal({
	repo,
	onClose,
}: {
	repo: string;
	onClose: () => void;
}) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({
		tag_name: '',
		target_commitish: 'main',
		name: '',
		body: '',
		draft: false,
		prerelease: false,
	});
	const submit = async () => {
		const ok = await forgejoService.createRelease(repo, state);
		if (ok) onClose();
	};
	return (
		<Modal
			title={`New release · ${repo}`}
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === `release-create-${repo}`}
						disabled={!state.tag_name}>
						Create
					</ActionButton>
				</>
			}>
			<TextField
				label="Tag"
				value={state.tag_name}
				onChange={(v) => set('tag_name', v)}
			/>
			<TextField
				label="Target branch / commit"
				value={state.target_commitish}
				onChange={(v) => set('target_commitish', v)}
			/>
			<TextField
				label="Title"
				value={state.name}
				onChange={(v) => set('name', v)}
			/>
			<TextField
				label="Notes"
				value={state.body}
				onChange={(v) => set('body', v)}
				textarea
			/>
			<Toggle
				label="Draft"
				checked={state.draft}
				onChange={(v) => set('draft', v)}
			/>
			<Toggle
				label="Pre-release"
				checked={state.prerelease}
				onChange={(v) => set('prerelease', v)}
			/>
		</Modal>
	);
}

export default function ReactForgejoRepoAdmin() {
	const active = useTabActive('webhooks');
	const repos = useStore(forgejoService.$repos);
	const selected = useStore(forgejoService.$selectedRepo);
	const hooksMap = useStore(forgejoService.$repoHooks);
	const releasesMap = useStore(forgejoService.$repoReleases);
	const busy = useStore(forgejoService.$busy);
	const [modal, setModal] = useState<'hook' | 'release' | null>(null);
	const [confirm, setConfirm] = useState<{
		kind: 'hook' | 'release';
		id: number;
	} | null>(null);

	if (!active) return null;

	const hooks = selected ? hooksMap[selected] : undefined;
	const releases = selected ? releasesMap[selected] : undefined;

	return (
		<div className="not-content">
			<div style={{ maxWidth: 420, marginBottom: '1.5rem' }}>
				<SelectField
					label="Repository"
					value={selected ?? ''}
					onChange={(v) => forgejoService.selectRepo(v)}
					options={[
						{ value: '', label: 'Select a repository…' },
						...repos.map((r) => ({
							value: r.full_name,
							label: r.full_name,
						})),
					]}
				/>
			</div>

			{!selected && (
				<span style={{ color: subText, fontSize: '0.85rem' }}>
					Choose a repository to manage its webhooks and releases.
				</span>
			)}

			{selected && (
				<div
					style={{
						display: 'grid',
						gap: '1.5rem',
						gridTemplateColumns:
							'repeat(auto-fit, minmax(320px, 1fr))',
					}}>
					<div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								marginBottom: '0.75rem',
							}}>
							<h3 style={{ ...sectionTitle, margin: 0, flex: 1 }}>
								<Webhook size={14} /> Webhooks
							</h3>
							<ActionButton
								size="sm"
								variant="primary"
								onClick={() => setModal('hook')}>
								<Plus size={12} /> Add
							</ActionButton>
						</div>
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
							}}>
							{(hooks ?? []).map((h) => (
								<div
									key={h.id}
									style={{
										padding: '0.6rem 0.7rem',
										borderRadius: 8,
										border,
										background: panelBg,
									}}>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 6,
										}}>
										{h.active ? (
											<CheckCircle2
												size={13}
												style={{ color: '#22c55e' }}
											/>
										) : (
											<XCircle
												size={13}
												style={{ color: '#6b7280' }}
											/>
										)}
										<span
											style={{
												flex: 1,
												color: textColor,
												fontSize: '0.78rem',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}>
											{h.config?.url ?? h.type}
										</span>
										<ActionButton
											size="sm"
											title="Test"
											loading={
												busy ===
												`hook-test-${selected}-${h.id}`
											}
											onClick={() =>
												forgejoService.testHook(
													selected,
													h.id,
												)
											}>
											<Send size={11} />
										</ActionButton>
										<ActionButton
											size="sm"
											variant="danger"
											onClick={() =>
												setConfirm({
													kind: 'hook',
													id: h.id,
												})
											}>
											<Trash2 size={11} />
										</ActionButton>
									</div>
									<div
										style={{
											color: subText,
											fontSize: '0.68rem',
											marginTop: 4,
										}}>
										{(h.events ?? []).join(', ')}
									</div>
								</div>
							))}
							{hooks && hooks.length === 0 && (
								<span
									style={{
										color: subText,
										fontSize: '0.8rem',
									}}>
									No webhooks.
								</span>
							)}
						</div>
					</div>

					<div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								marginBottom: '0.75rem',
							}}>
							<h3 style={{ ...sectionTitle, margin: 0, flex: 1 }}>
								<Tag size={14} /> Releases
							</h3>
							<ActionButton
								size="sm"
								variant="primary"
								onClick={() => setModal('release')}>
								<Plus size={12} /> Add
							</ActionButton>
						</div>
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
							}}>
							{(releases ?? []).map((r) => (
								<div
									key={r.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										padding: '0.6rem 0.7rem',
										borderRadius: 8,
										border,
										background: panelBg,
									}}>
									<span
										style={{
											color: textColor,
											fontWeight: 600,
											fontSize: '0.8rem',
										}}>
										{r.tag_name}
									</span>
									{r.draft && (
										<span
											style={{
												color: '#6b7280',
												fontSize: '0.68rem',
											}}>
											draft
										</span>
									)}
									{r.prerelease && (
										<span
											style={{
												color: '#f59e0b',
												fontSize: '0.68rem',
											}}>
											pre
										</span>
									)}
									<span
										style={{
											marginLeft: 'auto',
											color: subText,
											fontSize: '0.68rem',
										}}>
										{timeAgo(
											r.published_at || r.created_at,
										)}
									</span>
									<ActionButton
										size="sm"
										variant="danger"
										onClick={() =>
											setConfirm({
												kind: 'release',
												id: r.id,
											})
										}>
										<Trash2 size={11} />
									</ActionButton>
								</div>
							))}
							{releases && releases.length === 0 && (
								<span
									style={{
										color: subText,
										fontSize: '0.8rem',
									}}>
									No releases.
								</span>
							)}
						</div>
					</div>
				</div>
			)}

			{modal === 'hook' && selected && (
				<CreateHookModal
					repo={selected}
					onClose={() => setModal(null)}
				/>
			)}
			{modal === 'release' && selected && (
				<CreateReleaseModal
					repo={selected}
					onClose={() => setModal(null)}
				/>
			)}
			{confirm && selected && (
				<ConfirmDialog
					title={`Delete ${confirm.kind}`}
					message={`Delete this ${confirm.kind}? This cannot be undone.`}
					confirmLabel="Delete"
					danger
					loading={
						busy ===
						`${confirm.kind}-delete-${selected}-${confirm.id}`
					}
					onCancel={() => setConfirm(null)}
					onConfirm={async () => {
						const ok =
							confirm.kind === 'hook'
								? await forgejoService.deleteHook(
										selected,
										confirm.id,
									)
								: await forgejoService.deleteRelease(
										selected,
										confirm.id,
									);
						if (ok) setConfirm(null);
					}}
				/>
			)}
		</div>
	);
}
