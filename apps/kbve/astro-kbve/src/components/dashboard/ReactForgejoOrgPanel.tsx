import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	forgejoService,
	type ForgejoOrg,
	type ForgejoTeam,
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
	Pencil,
	Trash2,
	ChevronDown,
	ChevronRight,
	Users,
	X,
	UserPlus,
	BookMarked,
	BookPlus,
} from 'lucide-react';

const { textColor, subText, border, panelBg } = uiTokens;

type ModalKind =
	| { type: 'create' }
	| { type: 'edit'; org: ForgejoOrg }
	| { type: 'delete'; org: ForgejoOrg }
	| { type: 'team'; org: ForgejoOrg }
	| null;

function CreateOrgModal({ onClose }: { onClose: () => void }) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({
		username: '',
		full_name: '',
		description: '',
		visibility: 'public',
	});
	const submit = async () => {
		const ok = await forgejoService.createOrg(state);
		if (ok) onClose();
	};
	return (
		<Modal
			title="New organization"
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === 'org-create'}
						disabled={!state.username}>
						Create
					</ActionButton>
				</>
			}>
			<TextField
				label="Username"
				value={state.username}
				onChange={(v) => set('username', v)}
			/>
			<TextField
				label="Display name"
				value={state.full_name}
				onChange={(v) => set('full_name', v)}
			/>
			<TextField
				label="Description"
				value={state.description}
				onChange={(v) => set('description', v)}
				textarea
			/>
			<SelectField
				label="Visibility"
				value={state.visibility}
				onChange={(v) => set('visibility', v)}
				options={[
					{ value: 'public', label: 'public' },
					{ value: 'limited', label: 'limited' },
					{ value: 'private', label: 'private' },
				]}
			/>
		</Modal>
	);
}

function EditOrgModal({
	org,
	onClose,
}: {
	org: ForgejoOrg;
	onClose: () => void;
}) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({
		full_name: org.full_name ?? '',
		description: org.description ?? '',
		visibility: org.visibility ?? 'public',
	});
	const submit = async () => {
		const ok = await forgejoService.editOrg(org.username, state);
		if (ok) onClose();
	};
	return (
		<Modal
			title={`Edit ${org.username}`}
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === `org-edit-${org.username}`}>
						Save
					</ActionButton>
				</>
			}>
			<TextField
				label="Display name"
				value={state.full_name}
				onChange={(v) => set('full_name', v)}
			/>
			<TextField
				label="Description"
				value={state.description}
				onChange={(v) => set('description', v)}
				textarea
			/>
			<SelectField
				label="Visibility"
				value={state.visibility}
				onChange={(v) => set('visibility', v)}
				options={[
					{ value: 'public', label: 'public' },
					{ value: 'limited', label: 'limited' },
					{ value: 'private', label: 'private' },
				]}
			/>
		</Modal>
	);
}

function CreateTeamModal({
	org,
	onClose,
}: {
	org: ForgejoOrg;
	onClose: () => void;
}) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({
		name: '',
		description: '',
		permission: 'write',
		includes_all_repositories: false,
		can_create_org_repo: false,
	});
	const submit = async () => {
		const ok = await forgejoService.createTeam(org.username, {
			...state,
			units: [
				'repo.code',
				'repo.issues',
				'repo.pulls',
				'repo.releases',
				'repo.wiki',
			],
		});
		if (ok) onClose();
	};
	return (
		<Modal
			title={`New team in ${org.username}`}
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === `team-create-${org.username}`}
						disabled={!state.name}>
						Create
					</ActionButton>
				</>
			}>
			<TextField
				label="Name"
				value={state.name}
				onChange={(v) => set('name', v)}
			/>
			<TextField
				label="Description"
				value={state.description}
				onChange={(v) => set('description', v)}
			/>
			<SelectField
				label="Permission"
				value={state.permission}
				onChange={(v) => set('permission', v)}
				options={[
					{ value: 'read', label: 'read' },
					{ value: 'write', label: 'write' },
					{ value: 'admin', label: 'admin' },
				]}
			/>
			<Toggle
				label="Includes all repositories"
				checked={state.includes_all_repositories}
				onChange={(v) => set('includes_all_repositories', v)}
			/>
			<Toggle
				label="Can create org repositories"
				checked={state.can_create_org_repo}
				onChange={(v) => set('can_create_org_repo', v)}
			/>
		</Modal>
	);
}

function TeamRow({ org, team }: { org: string; team: ForgejoTeam }) {
	const busy = useStore(forgejoService.$busy);
	const membersMap = useStore(forgejoService.$teamMembers);
	const reposMap = useStore(forgejoService.$teamRepos);
	const [open, setOpen] = useState(false);
	const [newMember, setNewMember] = useState('');
	const [newRepo, setNewRepo] = useState('');
	const members = membersMap[team.id];
	const repos = reposMap[team.id];

	const toggle = () => {
		const next = !open;
		setOpen(next);
		if (next && members === undefined)
			forgejoService.loadTeamMembers(team.id);
		if (next && repos === undefined) forgejoService.loadTeamRepos(team.id);
	};

	return (
		<div style={{ border, borderRadius: 8, background: panelBg }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					padding: '0.5rem 0.7rem',
				}}>
				<button
					type="button"
					onClick={toggle}
					style={{
						background: 'transparent',
						border: 'none',
						color: subText,
						cursor: 'pointer',
						display: 'flex',
					}}>
					{open ? (
						<ChevronDown size={14} />
					) : (
						<ChevronRight size={14} />
					)}
				</button>
				<span
					style={{
						color: textColor,
						fontWeight: 600,
						fontSize: '0.82rem',
					}}>
					{team.name}
				</span>
				<span style={{ color: subText, fontSize: '0.7rem' }}>
					{team.permission}
				</span>
				<div style={{ marginLeft: 'auto' }}>
					{team.name !== 'Owners' && (
						<ActionButton
							size="sm"
							variant="danger"
							loading={busy === `team-delete-${team.id}`}
							onClick={() =>
								forgejoService.deleteTeam(org, team.id)
							}>
							<Trash2 size={12} />
						</ActionButton>
					)}
				</div>
			</div>
			{open && (
				<div style={{ padding: '0 0.7rem 0.7rem 2rem' }}>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 6,
							marginBottom: 8,
						}}>
						{(members ?? []).map((m) => (
							<div
								key={m.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									fontSize: '0.8rem',
									color: textColor,
								}}>
								<Users size={12} style={{ color: subText }} />
								<span style={{ flex: 1 }}>{m.login}</span>
								<ActionButton
									size="sm"
									variant="danger"
									loading={
										busy ===
										`team-member-remove-${team.id}-${m.login}`
									}
									onClick={() =>
										forgejoService.removeTeamMember(
											team.id,
											m.login,
										)
									}>
									<X size={11} />
								</ActionButton>
							</div>
						))}
						{members && members.length === 0 && (
							<span
								style={{ color: subText, fontSize: '0.78rem' }}>
								No members.
							</span>
						)}
					</div>
					<div style={{ display: 'flex', gap: 6 }}>
						<input
							value={newMember}
							onChange={(e) => setNewMember(e.target.value)}
							placeholder="username"
							style={{
								flex: 1,
								padding: '0.3rem 0.5rem',
								borderRadius: 6,
								border,
								background: 'var(--sl-color-bg, #0d1117)',
								color: textColor,
								fontSize: '0.78rem',
							}}
						/>
						<ActionButton
							size="sm"
							variant="primary"
							disabled={!newMember}
							loading={
								busy ===
								`team-member-add-${team.id}-${newMember}`
							}
							onClick={async () => {
								await forgejoService.addTeamMember(
									team.id,
									newMember,
								);
								setNewMember('');
							}}>
							<UserPlus size={12} /> Add
						</ActionButton>
					</div>

					<div
						style={{
							marginTop: 12,
							paddingTop: 10,
							borderTop: border,
						}}>
						<div
							style={{
								fontSize: '0.68rem',
								fontWeight: 600,
								color: subText,
								textTransform: 'uppercase',
								letterSpacing: '0.04em',
								marginBottom: 8,
							}}>
							Repositories
						</div>
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 6,
								marginBottom: 8,
							}}>
							{(repos ?? []).map((r) => (
								<div
									key={r.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										fontSize: '0.8rem',
										color: textColor,
									}}>
									<BookMarked
										size={12}
										style={{ color: subText }}
									/>
									<span style={{ flex: 1 }}>
										{r.name}
										{r.private && (
											<span
												style={{
													color: subText,
													fontSize: '0.68rem',
													marginLeft: 6,
												}}>
												private
											</span>
										)}
									</span>
									<ActionButton
										size="sm"
										variant="danger"
										loading={
											busy ===
											`team-repo-remove-${team.id}-${r.name}`
										}
										onClick={() =>
											forgejoService.removeTeamRepo(
												team.id,
												org,
												r.name,
											)
										}>
										<X size={11} />
									</ActionButton>
								</div>
							))}
							{repos && repos.length === 0 && (
								<span
									style={{
										color: subText,
										fontSize: '0.78rem',
									}}>
									No repositories assigned.
								</span>
							)}
						</div>
						<div style={{ display: 'flex', gap: 6 }}>
							<input
								value={newRepo}
								onChange={(e) => setNewRepo(e.target.value)}
								placeholder="repository name"
								style={{
									flex: 1,
									padding: '0.3rem 0.5rem',
									borderRadius: 6,
									border,
									background: 'var(--sl-color-bg, #0d1117)',
									color: textColor,
									fontSize: '0.78rem',
								}}
							/>
							<ActionButton
								size="sm"
								variant="primary"
								disabled={!newRepo}
								loading={
									busy ===
									`team-repo-add-${team.id}-${newRepo}`
								}
								onClick={async () => {
									await forgejoService.addTeamRepo(
										team.id,
										org,
										newRepo,
									);
									setNewRepo('');
								}}>
								<BookPlus size={12} /> Add
							</ActionButton>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function OrgCard({ org }: { org: ForgejoOrg }) {
	const busy = useStore(forgejoService.$busy);
	const teamsMap = useStore(forgejoService.$teams);
	const [expanded, setExpanded] = useState(false);
	const [modal, setModal] = useState<ModalKind>(null);
	const teams = teamsMap[org.username];

	const toggle = () => {
		const next = !expanded;
		setExpanded(next);
		if (next && teams === undefined) forgejoService.loadTeams(org.username);
	};

	return (
		<div
			style={{
				border,
				borderRadius: 10,
				background: panelBg,
				overflow: 'hidden',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '0.85rem 1rem',
				}}>
				{org.avatar_url && (
					<img
						src={org.avatar_url}
						alt=""
						width={32}
						height={32}
						style={{ borderRadius: 8 }}
					/>
				)}
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							color: textColor,
							fontWeight: 600,
							fontSize: '0.9rem',
						}}>
						{org.full_name || org.username}
					</div>
					<div style={{ color: subText, fontSize: '0.72rem' }}>
						@{org.username} · {org.visibility}
					</div>
				</div>
				<ActionButton size="sm" onClick={toggle}>
					<Users size={12} /> Teams
				</ActionButton>
				<ActionButton
					size="sm"
					title="Edit"
					onClick={() => setModal({ type: 'edit', org })}>
					<Pencil size={12} />
				</ActionButton>
				<ActionButton
					size="sm"
					variant="danger"
					title="Delete"
					onClick={() => setModal({ type: 'delete', org })}>
					<Trash2 size={12} />
				</ActionButton>
			</div>
			{expanded && (
				<div
					style={{
						padding: '0.75rem 1rem',
						borderTop: border,
						display: 'flex',
						flexDirection: 'column',
						gap: 8,
					}}>
					<div
						style={{ display: 'flex', justifyContent: 'flex-end' }}>
						<ActionButton
							size="sm"
							variant="primary"
							onClick={() => setModal({ type: 'team', org })}>
							<Plus size={12} /> New team
						</ActionButton>
					</div>
					{(teams ?? []).map((t) => (
						<TeamRow key={t.id} org={org.username} team={t} />
					))}
					{teams && teams.length === 0 && (
						<span style={{ color: subText, fontSize: '0.8rem' }}>
							No teams.
						</span>
					)}
				</div>
			)}

			{modal?.type === 'edit' && (
				<EditOrgModal org={modal.org} onClose={() => setModal(null)} />
			)}
			{modal?.type === 'team' && (
				<CreateTeamModal
					org={modal.org}
					onClose={() => setModal(null)}
				/>
			)}
			{modal?.type === 'delete' && (
				<ConfirmDialog
					title="Delete organization"
					message={`Delete ${modal.org.username} and all its repositories? This cannot be undone.`}
					confirmLabel="Delete"
					danger
					loading={busy === `org-delete-${modal.org.username}`}
					onCancel={() => setModal(null)}
					onConfirm={async () => {
						const ok = await forgejoService.deleteOrg(
							modal.org.username,
						);
						if (ok) setModal(null);
					}}
				/>
			)}
		</div>
	);
}

export default function ReactForgejoOrgPanel() {
	const active = useTabActive('orgs');
	const orgs = useStore(forgejoService.$orgs);
	const hasMore = useStore(forgejoService.$orgsHasMore);
	const [createOpen, setCreateOpen] = useState(false);

	if (!active) return null;

	return (
		<div className="not-content">
			<ForgejoNotice ctx="orgs" />
			<div
				style={{
					display: 'flex',
					justifyContent: 'flex-end',
					marginBottom: '1rem',
				}}>
				<ActionButton
					variant="primary"
					onClick={() => setCreateOpen(true)}>
					<Plus size={14} /> New organization
				</ActionButton>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
				{orgs.map((org) => (
					<OrgCard key={org.id} org={org} />
				))}
				{orgs.length === 0 && (
					<span style={{ color: subText, fontSize: '0.85rem' }}>
						No organizations found.
					</span>
				)}
			</div>
			<LoadMoreButton
				hasMore={hasMore}
				onClick={() => forgejoService.loadMoreOrgs()}
			/>
			{createOpen && (
				<CreateOrgModal onClose={() => setCreateOpen(false)} />
			)}
		</div>
	);
}
