import { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
	forgejoService,
	formatSize,
	timeAgo,
	langColor,
	type ForgejoRepo,
} from './forgejoService';
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
	LoadMoreButton,
	ForgejoNotice,
} from './forgejoUi';
import {
	Plus,
	DownloadCloud,
	Lock,
	GitFork,
	Archive,
	Pencil,
	Trash2,
	UsersRound,
	ArrowRightLeft,
	Search,
	X,
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

type ModalKind =
	| { type: 'create' }
	| { type: 'migrate' }
	| { type: 'edit'; repo: ForgejoRepo }
	| { type: 'transfer'; repo: ForgejoRepo }
	| { type: 'collaborators'; repo: ForgejoRepo }
	| { type: 'delete'; repo: ForgejoRepo }
	| null;

function ownerOptions(): { value: string; label: string }[] {
	const orgs = forgejoService.$orgs.get().map((o) => ({
		value: `org:${o.username}`,
		label: `${o.username} (org)`,
	}));
	const users = forgejoService.$users.get().map((u) => ({
		value: `user:${u.login}`,
		label: u.login,
	}));
	return [...orgs, ...users];
}

function CreateRepoModal({ onClose }: { onClose: () => void }) {
	const busy = useStore(forgejoService.$busy);
	const opts = ownerOptions();
	const { state, set } = useForm({
		owner: opts[0]?.value ?? '',
		name: '',
		description: '',
		private: false,
		auto_init: true,
		default_branch: 'main',
	});
	const submit = async () => {
		const [kind, owner] = state.owner.split(':');
		const ok = await forgejoService.createRepo({
			owner,
			ownerIsOrg: kind === 'org',
			name: state.name,
			description: state.description,
			private: state.private,
			auto_init: state.auto_init,
			default_branch: state.default_branch,
		});
		if (ok) onClose();
	};
	return (
		<Modal
			title="New repository"
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === 'repo-create'}
						disabled={!state.name || !state.owner}>
						Create
					</ActionButton>
				</>
			}>
			<SelectField
				label="Owner"
				value={state.owner}
				options={opts}
				onChange={(v) => set('owner', v)}
			/>
			<TextField
				label="Name"
				value={state.name}
				onChange={(v) => set('name', v)}
				placeholder="my-repo"
			/>
			<TextField
				label="Description"
				value={state.description}
				onChange={(v) => set('description', v)}
			/>
			<TextField
				label="Default branch"
				value={state.default_branch}
				onChange={(v) => set('default_branch', v)}
			/>
			<Toggle
				label="Private"
				checked={state.private}
				onChange={(v) => set('private', v)}
			/>
			<Toggle
				label="Initialize with README"
				checked={state.auto_init}
				onChange={(v) => set('auto_init', v)}
			/>
		</Modal>
	);
}

function MigrateRepoModal({ onClose }: { onClose: () => void }) {
	const busy = useStore(forgejoService.$busy);
	const opts = ownerOptions();
	const { state, set } = useForm({
		clone_addr: '',
		repo_name: '',
		owner: opts[0]?.value ?? '',
		mirror: false,
		private: false,
		description: '',
		auth_token: '',
	});
	const submit = async () => {
		const [, owner] = state.owner.split(':');
		const ok = await forgejoService.migrateRepo({
			clone_addr: state.clone_addr,
			repo_name: state.repo_name,
			repo_owner: owner,
			mirror: state.mirror,
			private: state.private,
			description: state.description,
			auth_token: state.auth_token || undefined,
		});
		if (ok) onClose();
	};
	return (
		<Modal
			title="Migrate / mirror repository"
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === 'repo-migrate'}
						disabled={!state.clone_addr || !state.repo_name}>
						Migrate
					</ActionButton>
				</>
			}>
			<TextField
				label="Clone URL"
				value={state.clone_addr}
				onChange={(v) => set('clone_addr', v)}
				placeholder="https://github.com/owner/repo.git"
			/>
			<SelectField
				label="Owner"
				value={state.owner}
				options={opts}
				onChange={(v) => set('owner', v)}
			/>
			<TextField
				label="Repository name"
				value={state.repo_name}
				onChange={(v) => set('repo_name', v)}
			/>
			<TextField
				label="Description"
				value={state.description}
				onChange={(v) => set('description', v)}
			/>
			<TextField
				label="Auth token (optional, for private source)"
				value={state.auth_token}
				onChange={(v) => set('auth_token', v)}
				type="password"
			/>
			<Toggle
				label="Mirror (keep synced)"
				checked={state.mirror}
				onChange={(v) => set('mirror', v)}
			/>
			<Toggle
				label="Private"
				checked={state.private}
				onChange={(v) => set('private', v)}
			/>
		</Modal>
	);
}

function EditRepoModal({
	repo,
	onClose,
}: {
	repo: ForgejoRepo;
	onClose: () => void;
}) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({
		description: repo.description ?? '',
		default_branch: repo.default_branch ?? 'main',
		private: repo.private,
		archived: repo.archived,
	});
	const submit = async () => {
		const ok = await forgejoService.editRepo(repo.full_name, {
			description: state.description,
			default_branch: state.default_branch,
			private: state.private,
			archived: state.archived,
		});
		if (ok) onClose();
	};
	return (
		<Modal
			title={`Edit ${repo.full_name}`}
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === `repo-edit-${repo.full_name}`}>
						Save
					</ActionButton>
				</>
			}>
			<TextField
				label="Description"
				value={state.description}
				onChange={(v) => set('description', v)}
				textarea
			/>
			<TextField
				label="Default branch"
				value={state.default_branch}
				onChange={(v) => set('default_branch', v)}
			/>
			<Toggle
				label="Private"
				checked={state.private}
				onChange={(v) => set('private', v)}
			/>
			<Toggle
				label="Archived"
				checked={state.archived}
				onChange={(v) => set('archived', v)}
			/>
		</Modal>
	);
}

function TransferRepoModal({
	repo,
	onClose,
}: {
	repo: ForgejoRepo;
	onClose: () => void;
}) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({ newOwner: '' });
	const submit = async () => {
		const ok = await forgejoService.transferRepo(
			repo.full_name,
			state.newOwner,
		);
		if (ok) onClose();
	};
	return (
		<Modal
			title={`Transfer ${repo.full_name}`}
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === `repo-transfer-${repo.full_name}`}
						disabled={!state.newOwner}>
						Transfer
					</ActionButton>
				</>
			}>
			<TextField
				label="New owner (user or org)"
				value={state.newOwner}
				onChange={(v) => set('newOwner', v)}
			/>
		</Modal>
	);
}

function CollaboratorsModal({
	repo,
	onClose,
}: {
	repo: ForgejoRepo;
	onClose: () => void;
}) {
	const busy = useStore(forgejoService.$busy);
	const collabMap = useStore(forgejoService.$collaborators);
	const collabs = collabMap[repo.full_name];
	const [user, setUser] = useState('');
	const [perm, setPerm] = useState('write');
	if (collabs === undefined) forgejoService.loadCollaborators(repo.full_name);
	return (
		<Modal
			title={`Collaborators · ${repo.full_name}`}
			onClose={onClose}
			width={520}>
			<ForgejoNotice
				ctx="collaborators"
				onRetry={() => forgejoService.loadCollaborators(repo.full_name)}
			/>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
					marginBottom: '1rem',
				}}>
				{(collabs ?? []).map((c) => (
					<div
						key={c.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '0.4rem 0.6rem',
							borderRadius: 7,
							background: panelBg,
							border,
						}}>
						<span
							style={{
								color: textColor,
								fontSize: '0.82rem',
								flex: 1,
							}}>
							{c.login}
						</span>
						{c.permissions && (
							<span
								style={{ color: subText, fontSize: '0.72rem' }}>
								{c.permissions.admin
									? 'admin'
									: c.permissions.push
										? 'write'
										: 'read'}
							</span>
						)}
						<ActionButton
							size="sm"
							variant="danger"
							loading={
								busy ===
								`collab-remove-${repo.full_name}-${c.login}`
							}
							onClick={() =>
								forgejoService.removeCollaborator(
									repo.full_name,
									c.login,
								)
							}>
							<X size={12} />
						</ActionButton>
					</div>
				))}
				{collabs && collabs.length === 0 && (
					<span style={{ color: subText, fontSize: '0.8rem' }}>
						No collaborators.
					</span>
				)}
			</div>
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
				<div style={{ flex: 1 }}>
					<TextField
						label="Add user"
						value={user}
						onChange={setUser}
					/>
				</div>
				<div style={{ width: 130 }}>
					<SelectField
						label="Permission"
						value={perm}
						onChange={setPerm}
						options={[
							{ value: 'read', label: 'read' },
							{ value: 'write', label: 'write' },
							{ value: 'admin', label: 'admin' },
						]}
					/>
				</div>
				<div style={{ marginBottom: '0.75rem' }}>
					<ActionButton
						variant="primary"
						disabled={!user}
						loading={
							busy === `collab-add-${repo.full_name}-${user}`
						}
						onClick={async () => {
							await forgejoService.addCollaborator(
								repo.full_name,
								user,
								perm,
							);
							setUser('');
						}}>
						<Plus size={13} /> Add
					</ActionButton>
				</div>
			</div>
		</Modal>
	);
}

export default function ReactForgejoRepoPanel() {
	const active = useTabActive('repos');
	const repos = useStore(forgejoService.$repos);
	const hasMore = useStore(forgejoService.$reposHasMore);
	const busy = useStore(forgejoService.$busy);
	const [modal, setModal] = useState<ModalKind>(null);
	const [query, setQuery] = useState(() => forgejoService.$repoQuery.get());
	const firstRun = useRef(true);

	useEffect(() => {
		if (firstRun.current) {
			firstRun.current = false;
			return;
		}
		const t = setTimeout(() => forgejoService.setRepoSearch(query), 300);
		return () => clearTimeout(t);
	}, [query]);

	if (!active) return null;

	return (
		<div className="not-content">
			<div
				style={{
					display: 'flex',
					gap: 8,
					alignItems: 'center',
					marginBottom: '1rem',
					flexWrap: 'wrap',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						flex: '1 1 220px',
						padding: '0.35rem 0.6rem',
						borderRadius: 8,
						border,
						background: 'var(--sl-color-bg, #0d1117)',
					}}>
					<Search size={14} style={{ color: subText }} />
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search repositories"
						style={{
							border: 'none',
							background: 'transparent',
							color: textColor,
							fontSize: '0.82rem',
							outline: 'none',
							width: '100%',
						}}
					/>
				</div>
				<ActionButton
					variant="primary"
					onClick={() => setModal({ type: 'create' })}>
					<Plus size={14} /> New repo
				</ActionButton>
				<ActionButton onClick={() => setModal({ type: 'migrate' })}>
					<DownloadCloud size={14} /> Migrate
				</ActionButton>
			</div>

			<div style={{ borderRadius: 10, border, overflow: 'hidden' }}>
				<table style={{ width: '100%', borderCollapse: 'collapse' }}>
					<thead>
						<tr style={{ background: panelBg }}>
							<th style={th}>Repository</th>
							<th style={{ ...th, textAlign: 'right' }}>Size</th>
							<th style={th}>Updated</th>
							<th style={{ ...th, textAlign: 'right' }}>
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{repos.map((repo) => (
							<tr key={repo.id}>
								<td style={td}>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 6,
										}}>
										{repo.language && (
											<span
												style={{
													width: 8,
													height: 8,
													borderRadius: '50%',
													background: langColor(
														repo.language,
													),
												}}
											/>
										)}
										<span style={{ fontWeight: 500 }}>
											{repo.full_name}
										</span>
										{repo.private && (
											<Lock
												size={11}
												style={{ color: '#f59e0b' }}
											/>
										)}
										{repo.fork && (
											<GitFork
												size={11}
												style={{ color: '#6b7280' }}
											/>
										)}
										{repo.archived && (
											<Archive
												size={11}
												style={{ color: '#6b7280' }}
											/>
										)}
									</div>
								</td>
								<td
									style={{
										...td,
										textAlign: 'right',
										fontFamily: 'monospace',
									}}>
									{formatSize(repo.size)}
									{repo.lfs_size > 0 && (
										<div
											style={{
												color: '#8b5cf6',
												fontSize: '0.62rem',
											}}>
											LFS {formatSize(repo.lfs_size)}
										</div>
									)}
								</td>
								<td
									style={{
										...td,
										color: subText,
										fontSize: '0.72rem',
									}}>
									{timeAgo(repo.updated_at)}
								</td>
								<td style={{ ...td, textAlign: 'right' }}>
									<div
										style={{
											display: 'inline-flex',
											gap: 4,
											justifyContent: 'flex-end',
										}}>
										<ActionButton
											size="sm"
											title="Collaborators"
											onClick={() =>
												setModal({
													type: 'collaborators',
													repo,
												})
											}>
											<UsersRound size={12} />
										</ActionButton>
										<ActionButton
											size="sm"
											title="Transfer"
											onClick={() =>
												setModal({
													type: 'transfer',
													repo,
												})
											}>
											<ArrowRightLeft size={12} />
										</ActionButton>
										<ActionButton
											size="sm"
											title={
												repo.archived
													? 'Unarchive'
													: 'Archive'
											}
											loading={
												busy ===
												`repo-edit-${repo.full_name}`
											}
											onClick={() =>
												forgejoService.editRepo(
													repo.full_name,
													{
														archived:
															!repo.archived,
													},
												)
											}>
											<Archive size={12} />
										</ActionButton>
										<ActionButton
											size="sm"
											title="Edit"
											onClick={() =>
												setModal({ type: 'edit', repo })
											}>
											<Pencil size={12} />
										</ActionButton>
										<ActionButton
											size="sm"
											variant="danger"
											title="Delete"
											onClick={() =>
												setModal({
													type: 'delete',
													repo,
												})
											}>
											<Trash2 size={12} />
										</ActionButton>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<LoadMoreButton
				hasMore={hasMore}
				onClick={() => forgejoService.loadMoreRepos()}
			/>

			{modal?.type === 'create' && (
				<CreateRepoModal onClose={() => setModal(null)} />
			)}
			{modal?.type === 'migrate' && (
				<MigrateRepoModal onClose={() => setModal(null)} />
			)}
			{modal?.type === 'edit' && (
				<EditRepoModal
					repo={modal.repo}
					onClose={() => setModal(null)}
				/>
			)}
			{modal?.type === 'transfer' && (
				<TransferRepoModal
					repo={modal.repo}
					onClose={() => setModal(null)}
				/>
			)}
			{modal?.type === 'collaborators' && (
				<CollaboratorsModal
					repo={modal.repo}
					onClose={() => setModal(null)}
				/>
			)}
			{modal?.type === 'delete' && (
				<ConfirmDialog
					title="Delete repository"
					message={`Permanently delete ${modal.repo.full_name}? This cannot be undone.`}
					confirmLabel="Delete"
					danger
					loading={busy === `repo-delete-${modal.repo.full_name}`}
					onCancel={() => setModal(null)}
					onConfirm={async () => {
						const ok = await forgejoService.deleteRepo(
							modal.repo.full_name,
						);
						if (ok) setModal(null);
					}}
				/>
			)}
		</div>
	);
}
