import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { forgejoService, timeAgo, type ForgejoUser } from './forgejoService';
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
} from './forgejoUi';
import { Plus, Pencil, Trash2, ShieldCheck, Search } from 'lucide-react';

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

function pill(color: string, label: string) {
	return (
		<span
			style={{
				display: 'inline-block',
				padding: '1px 6px',
				borderRadius: 4,
				fontSize: '0.62rem',
				fontWeight: 600,
				background: `${color}22`,
				color,
				textTransform: 'uppercase',
				letterSpacing: '0.04em',
			}}>
			{label}
		</span>
	);
}

type ModalKind =
	| { type: 'create' }
	| { type: 'edit'; user: ForgejoUser }
	| { type: 'delete'; user: ForgejoUser }
	| null;

function CreateUserModal({ onClose }: { onClose: () => void }) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({
		username: '',
		email: '',
		password: '',
		must_change_password: true,
		visibility: 'public',
	});
	const submit = async () => {
		const ok = await forgejoService.createUser(state);
		if (ok) onClose();
	};
	return (
		<Modal
			title="New user"
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === 'user-create'}
						disabled={
							!state.username || !state.email || !state.password
						}>
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
				label="Email"
				value={state.email}
				onChange={(v) => set('email', v)}
				type="email"
			/>
			<TextField
				label="Password"
				value={state.password}
				onChange={(v) => set('password', v)}
				type="password"
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
			<Toggle
				label="Must change password on first login"
				checked={state.must_change_password}
				onChange={(v) => set('must_change_password', v)}
			/>
		</Modal>
	);
}

function EditUserModal({
	user,
	onClose,
}: {
	user: ForgejoUser;
	onClose: () => void;
}) {
	const busy = useStore(forgejoService.$busy);
	const { state, set } = useForm({
		email: user.email ?? '',
		admin: user.is_admin,
		active: user.active,
		prohibit_login: user.prohibit_login,
	});
	const submit = async () => {
		const ok = await forgejoService.editUser(user.login, state);
		if (ok) onClose();
	};
	return (
		<Modal
			title={`Edit ${user.login}`}
			onClose={onClose}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						onClick={submit}
						loading={busy === `user-edit-${user.login}`}>
						Save
					</ActionButton>
				</>
			}>
			<TextField
				label="Email"
				value={state.email}
				onChange={(v) => set('email', v)}
				type="email"
			/>
			<Toggle
				label="Site administrator"
				checked={state.admin}
				onChange={(v) => set('admin', v)}
			/>
			<Toggle
				label="Active"
				checked={state.active}
				onChange={(v) => set('active', v)}
			/>
			<Toggle
				label="Prohibit login"
				checked={state.prohibit_login}
				onChange={(v) => set('prohibit_login', v)}
			/>
		</Modal>
	);
}

export default function ReactForgejoUserPanel() {
	const active = useTabActive('users');
	const users = useStore(forgejoService.$users);
	const hasMore = useStore(forgejoService.$usersHasMore);
	const busy = useStore(forgejoService.$busy);
	const [modal, setModal] = useState<ModalKind>(null);
	const [purge, setPurge] = useState(false);
	const [query, setQuery] = useState('');

	if (!active) return null;

	const filtered = users.filter(
		(u) =>
			u.login?.toLowerCase().includes(query.toLowerCase()) ||
			u.email?.toLowerCase().includes(query.toLowerCase()),
	);

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
						placeholder="Filter users"
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
					<Plus size={14} /> New user
				</ActionButton>
			</div>

			<div style={{ borderRadius: 10, border, overflow: 'hidden' }}>
				<table style={{ width: '100%', borderCollapse: 'collapse' }}>
					<thead>
						<tr style={{ background: panelBg }}>
							<th style={th}>User</th>
							<th style={th}>Email</th>
							<th style={th}>Status</th>
							<th style={th}>Last login</th>
							<th style={{ ...th, textAlign: 'right' }}>
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{filtered.map((u) => (
							<tr key={u.id}>
								<td style={td}>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
										}}>
										{u.avatar_url && (
											<img
												src={u.avatar_url}
												alt=""
												width={22}
												height={22}
												style={{ borderRadius: '50%' }}
											/>
										)}
										<span style={{ fontWeight: 500 }}>
											{u.login}
										</span>
										{u.is_admin && (
											<ShieldCheck
												size={13}
												style={{ color: '#06b6d4' }}
											/>
										)}
									</div>
								</td>
								<td style={{ ...td, color: subText }}>
									{u.email}
								</td>
								<td style={td}>
									<div style={{ display: 'flex', gap: 4 }}>
										{u.is_admin && pill('#06b6d4', 'admin')}
										{u.active
											? pill('#22c55e', 'active')
											: pill('#6b7280', 'inactive')}
										{u.prohibit_login &&
											pill('#ef4444', 'blocked')}
									</div>
								</td>
								<td
									style={{
										...td,
										color: subText,
										fontSize: '0.72rem',
									}}>
									{u.last_login &&
									!u.last_login.startsWith('0001')
										? timeAgo(u.last_login)
										: '—'}
								</td>
								<td style={{ ...td, textAlign: 'right' }}>
									<div
										style={{
											display: 'inline-flex',
											gap: 4,
										}}>
										<ActionButton
											size="sm"
											title="Edit"
											onClick={() =>
												setModal({
													type: 'edit',
													user: u,
												})
											}>
											<Pencil size={12} />
										</ActionButton>
										<ActionButton
											size="sm"
											variant="danger"
											title="Delete"
											onClick={() => {
												setPurge(false);
												setModal({
													type: 'delete',
													user: u,
												});
											}}>
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
				onClick={() => forgejoService.loadMoreUsers()}
			/>

			{modal?.type === 'create' && (
				<CreateUserModal onClose={() => setModal(null)} />
			)}
			{modal?.type === 'edit' && (
				<EditUserModal
					user={modal.user}
					onClose={() => setModal(null)}
				/>
			)}
			{modal?.type === 'delete' && (
				<ConfirmDialog
					title="Delete user"
					message={`Delete ${modal.user.login}?`}
					confirmLabel="Delete"
					danger
					loading={busy === `user-delete-${modal.user.login}`}
					onCancel={() => setModal(null)}
					onConfirm={async () => {
						const ok = await forgejoService.deleteUser(
							modal.user.login,
							purge,
						);
						if (ok) setModal(null);
					}}
					extra={
						<div style={{ marginTop: '0.75rem' }}>
							<Toggle
								label="Purge all content (repos, issues, comments)"
								checked={purge}
								onChange={setPurge}
							/>
						</div>
					}
				/>
			)}
		</div>
	);
}
