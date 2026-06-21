import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	forgejoService,
	formatBytes,
	type ForgejoContentEntry,
} from './forgejoService';
import {
	ActionButton,
	Modal,
	ConfirmDialog,
	SelectField,
	TextField,
	useForm,
	useTabActive,
	uiTokens,
	ForgejoNotice,
} from './forgejoUi';
import {
	Folder,
	FileText,
	FileLock2,
	ChevronRight,
	Home,
	Save,
	Trash2,
	Plus,
	Download,
	Loader2,
	X,
} from 'lucide-react';

const { textColor, subText, border, panelBg } = uiTokens;

function Breadcrumb({ path }: { path: string }) {
	const segments = path ? path.split('/') : [];
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 4,
				flexWrap: 'wrap',
				fontSize: '0.8rem',
				marginBottom: '0.75rem',
			}}>
			<button
				type="button"
				onClick={() => forgejoService.navigateDir('')}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 4,
					background: 'transparent',
					border: 'none',
					color: segments.length
						? 'var(--sl-color-accent, #06b6d4)'
						: subText,
					cursor: 'pointer',
					padding: 0,
				}}>
				<Home size={13} /> root
			</button>
			{segments.map((seg, i) => {
				const sub = segments.slice(0, i + 1).join('/');
				const last = i === segments.length - 1;
				return (
					<span
						key={sub}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
						}}>
						<ChevronRight size={12} style={{ color: subText }} />
						<button
							type="button"
							disabled={last}
							onClick={() => forgejoService.navigateDir(sub)}
							style={{
								background: 'transparent',
								border: 'none',
								color: last
									? textColor
									: 'var(--sl-color-accent, #06b6d4)',
								cursor: last ? 'default' : 'pointer',
								padding: 0,
								fontWeight: last ? 600 : 400,
							}}>
							{seg}
						</button>
					</span>
				);
			})}
		</div>
	);
}

function NewFileModal({ onClose }: { onClose: () => void }) {
	const busy = useStore(forgejoService.$busy);
	const dir = useStore(forgejoService.$filesPath);
	const { state, set } = useForm({ name: '', content: '', message: '' });
	const path = dir ? `${dir}/${state.name}` : state.name;
	return (
		<Modal
			title="New file"
			onClose={onClose}
			width={620}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onClose}>
						Cancel
					</ActionButton>
					<ActionButton
						variant="primary"
						disabled={!state.name}
						loading={busy === `file-create-${path}`}
						onClick={async () => {
							const ok = await forgejoService.createFile(
								state.name,
								state.content,
								state.message,
							);
							if (ok) onClose();
						}}>
						Create
					</ActionButton>
				</>
			}>
			<TextField
				label={`Path (under ${dir || 'root'})`}
				value={state.name}
				onChange={(v) => set('name', v)}
				placeholder="docs/notes.md"
			/>
			<label style={{ display: 'block', marginBottom: '0.75rem' }}>
				<span
					style={{
						display: 'block',
						fontSize: '0.72rem',
						fontWeight: 600,
						color: subText,
						marginBottom: 4,
						textTransform: 'uppercase',
						letterSpacing: '0.04em',
					}}>
					Content
				</span>
				<textarea
					value={state.content}
					onChange={(e) => set('content', e.target.value)}
					rows={10}
					spellCheck={false}
					style={{
						width: '100%',
						padding: '0.5rem 0.6rem',
						borderRadius: 7,
						border,
						background: 'var(--sl-color-bg, #0d1117)',
						color: textColor,
						fontSize: '0.78rem',
						fontFamily: 'monospace',
						boxSizing: 'border-box',
						resize: 'vertical',
					}}
				/>
			</label>
			<TextField
				label="Commit message"
				value={state.message}
				onChange={(v) => set('message', v)}
				placeholder={`Create ${state.name || 'file'}`}
			/>
		</Modal>
	);
}

function FileEditor() {
	const file = useStore(forgejoService.$openFile);
	const busy = useStore(forgejoService.$busy);
	const [text, setText] = useState('');
	const [message, setMessage] = useState('');

	useEffect(() => {
		setText(file?.text ?? '');
		setMessage('');
	}, [file?.path, file?.sha]);

	if (!file) return null;

	const editable = !file.binary && !file.tooLarge;
	const dirty = editable && text !== file.text;

	return (
		<div
			style={{
				border,
				borderRadius: 10,
				background: panelBg,
				marginTop: '1rem',
				overflow: 'hidden',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					padding: '0.6rem 0.8rem',
					borderBottom: border,
				}}>
				<FileText size={14} style={{ color: subText }} />
				<span
					style={{
						flex: 1,
						color: textColor,
						fontSize: '0.82rem',
						fontFamily: 'monospace',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}>
					{file.path}
				</span>
				<ActionButton
					size="sm"
					title="Close"
					onClick={() => forgejoService.closeFile()}>
					<X size={12} />
				</ActionButton>
			</div>

			{!editable ? (
				<div
					style={{
						padding: '1rem',
						color: subText,
						fontSize: '0.82rem',
					}}>
					{file.binary
						? 'Binary file — not editable here.'
						: 'File too large to edit in the dashboard.'}
				</div>
			) : (
				<div style={{ padding: '0.8rem' }}>
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						spellCheck={false}
						rows={20}
						style={{
							width: '100%',
							padding: '0.6rem',
							borderRadius: 7,
							border,
							background: 'var(--sl-color-bg, #0d1117)',
							color: textColor,
							fontSize: '0.78rem',
							fontFamily: 'monospace',
							boxSizing: 'border-box',
							resize: 'vertical',
						}}
					/>
					<div
						style={{
							display: 'flex',
							gap: 8,
							alignItems: 'center',
							marginTop: 8,
							flexWrap: 'wrap',
						}}>
						<input
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder={`Update ${file.path}`}
							style={{
								flex: '1 1 220px',
								padding: '0.45rem 0.6rem',
								borderRadius: 7,
								border,
								background: 'var(--sl-color-bg, #0d1117)',
								color: textColor,
								fontSize: '0.8rem',
							}}
						/>
						<ActionButton
							variant="primary"
							disabled={!dirty}
							loading={busy === `file-save-${file.path}`}
							onClick={() =>
								forgejoService.saveFile(
									file.path,
									file.sha,
									text,
									message,
								)
							}>
							<Save size={13} /> Commit
						</ActionButton>
					</div>
				</div>
			)}
		</div>
	);
}

export default function ReactForgejoFiles() {
	const active = useTabActive('files');
	const repos = useStore(forgejoService.$repos);
	const repo = useStore(forgejoService.$filesRepo);
	const path = useStore(forgejoService.$filesPath);
	const entries = useStore(forgejoService.$filesEntries);
	const loading = useStore(forgejoService.$filesLoading);
	const openFile = useStore(forgejoService.$openFile);
	const busy = useStore(forgejoService.$busy);
	const [newOpen, setNewOpen] = useState(false);
	const [delTarget, setDelTarget] = useState<ForgejoContentEntry | null>(
		null,
	);

	if (!active) return null;

	return (
		<div className="not-content">
			<ForgejoNotice
				ctx="files"
				onRetry={() => forgejoService.navigateDir(path)}
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
						value={repo ?? ''}
						onChange={(v) => v && forgejoService.selectFilesRepo(v)}
						options={[
							{ value: '', label: 'Select a repository…' },
							...repos.map((r) => ({
								value: r.full_name,
								label: r.full_name,
							})),
						]}
					/>
				</div>
				{repo && (
					<div style={{ marginBottom: '0.75rem' }}>
						<ActionButton
							variant="primary"
							onClick={() => setNewOpen(true)}>
							<Plus size={13} /> New file
						</ActionButton>
					</div>
				)}
			</div>

			{!repo && (
				<span style={{ color: subText, fontSize: '0.85rem' }}>
					Choose a repository to browse and edit its files.
				</span>
			)}

			{repo && (
				<>
					<Breadcrumb path={path} />

					{loading && entries.length === 0 ? (
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
					) : (
						<div
							style={{
								borderRadius: 10,
								border,
								overflow: 'hidden',
							}}>
							{entries.map((e) => {
								const isDir = e.type === 'dir';
								const isFile = e.type === 'file';
								return (
									<div
										key={e.path}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 10,
											padding: '0.5rem 0.75rem',
											borderBottom: border,
											background: panelBg,
										}}>
										{isDir ? (
											<Folder
												size={14}
												style={{ color: '#06b6d4' }}
											/>
										) : isFile ? (
											<FileText
												size={14}
												style={{ color: subText }}
											/>
										) : (
											<FileLock2
												size={14}
												style={{ color: subText }}
											/>
										)}
										<button
											type="button"
											onClick={() =>
												isDir
													? forgejoService.navigateDir(
															e.path,
														)
													: isFile
														? forgejoService.openFile(
																e,
															)
														: undefined
											}
											style={{
												flex: 1,
												textAlign: 'left',
												background: 'transparent',
												border: 'none',
												color: textColor,
												fontSize: '0.82rem',
												cursor:
													isDir || isFile
														? 'pointer'
														: 'default',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}>
											{e.name}
										</button>
										{isFile && (
											<span
												style={{
													color: subText,
													fontSize: '0.7rem',
												}}>
												{formatBytes(e.size)}
											</span>
										)}
										{e.download_url && (
											<a
												href={e.download_url}
												target="_blank"
												rel="noreferrer"
												style={{
													color: subText,
													display: 'flex',
												}}
												title="Download">
												<Download size={12} />
											</a>
										)}
										{isFile && (
											<ActionButton
												size="sm"
												variant="danger"
												title="Delete file"
												onClick={() => setDelTarget(e)}>
												<Trash2 size={11} />
											</ActionButton>
										)}
									</div>
								);
							})}
							{entries.length === 0 && (
								<div
									style={{
										padding: '0.75rem',
										color: subText,
										fontSize: '0.8rem',
										background: panelBg,
									}}>
									Empty directory.
								</div>
							)}
						</div>
					)}

					{openFile && <FileEditor />}
				</>
			)}

			{newOpen && <NewFileModal onClose={() => setNewOpen(false)} />}
			{delTarget && (
				<ConfirmDialog
					title="Delete file"
					message={`Delete ${delTarget.path}? This commits a deletion to the default branch.`}
					confirmLabel="Delete"
					danger
					loading={busy === `file-delete-${delTarget.path}`}
					onCancel={() => setDelTarget(null)}
					onConfirm={async () => {
						const ok = await forgejoService.deleteFile(
							delTarget,
							'',
						);
						if (ok) setDelTarget(null);
					}}
				/>
			)}
		</div>
	);
}
