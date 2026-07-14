import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { forgejoService, timeAgo } from './forgejoService';
import {
	ActionButton,
	useTabActive,
	uiTokens,
	ForgejoNotice,
} from './forgejoUi';
import {
	ServerCog,
	Play,
	FolderInput,
	Trash2,
	GitBranch,
	Clock,
} from 'lucide-react';

const { textColor, subText, border, panelBg } = uiTokens;

const cardStyle: React.CSSProperties = {
	border,
	borderRadius: 10,
	background: panelBg,
	padding: '1rem 1.1rem',
};

const cardTitle: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 6,
	fontSize: '0.8rem',
	fontWeight: 700,
	color: textColor,
	margin: '0 0 0.85rem',
};

export default function ReactForgejoSystemPanel() {
	const active = useTabActive('system');
	const version = useStore(forgejoService.$version);
	const cronTasks = useStore(forgejoService.$cronTasks);
	const unadopted = useStore(forgejoService.$unadopted);
	const busy = useStore(forgejoService.$busy);

	useEffect(() => {
		if (active) forgejoService.loadSystem();
	}, [active]);

	if (!active) return null;

	return (
		<div
			className="not-content"
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: '1.25rem',
			}}>
			<ForgejoNotice
				ctx="system"
				onRetry={() => forgejoService.loadSystem()}
			/>
			<div style={cardStyle}>
				<h3 style={cardTitle}>
					<ServerCog size={14} /> Server
				</h3>
				<div
					style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
					<span style={{ color: subText, fontSize: '0.78rem' }}>
						Forgejo version
					</span>
					<span
						style={{
							color: textColor,
							fontFamily: 'monospace',
							fontSize: '0.9rem',
							fontWeight: 600,
						}}>
						{version ?? '—'}
					</span>
				</div>
			</div>

			<div style={cardStyle}>
				<h3 style={cardTitle}>
					<Clock size={14} /> Cron tasks
				</h3>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 6,
					}}>
					{cronTasks.map((task) => (
						<div
							key={task.name}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '0.45rem 0.55rem',
								borderRadius: 7,
								border,
							}}>
							<span
								style={{
									color: textColor,
									fontSize: '0.8rem',
									flex: 1,
								}}>
								{task.name}
							</span>
							<code
								style={{ color: subText, fontSize: '0.68rem' }}>
								{task.schedule}
							</code>
							{task.prev && !task.prev.startsWith('0001') && (
								<span
									style={{
										color: subText,
										fontSize: '0.68rem',
									}}>
									ran {timeAgo(task.prev)}
								</span>
							)}
							<ActionButton
								size="sm"
								loading={busy === `cron-run-${task.name}`}
								onClick={() =>
									forgejoService.runCron(task.name)
								}>
								<Play size={11} /> Run
							</ActionButton>
						</div>
					))}
					{cronTasks.length === 0 && (
						<span style={{ color: subText, fontSize: '0.8rem' }}>
							No cron tasks available.
						</span>
					)}
				</div>
			</div>

			<div style={cardStyle}>
				<h3 style={cardTitle}>
					<GitBranch size={14} /> Unadopted repositories
				</h3>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 6,
					}}>
					{unadopted.map((name) => (
						<div
							key={name}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '0.45rem 0.55rem',
								borderRadius: 7,
								border,
							}}>
							<span
								style={{
									color: textColor,
									fontSize: '0.8rem',
									flex: 1,
								}}>
								{name}
							</span>
							<ActionButton
								size="sm"
								variant="primary"
								loading={busy === `unadopted-adopt-${name}`}
								onClick={() =>
									forgejoService.adoptUnadopted(name)
								}>
								<FolderInput size={11} /> Adopt
							</ActionButton>
							<ActionButton
								size="sm"
								variant="danger"
								loading={busy === `unadopted-delete-${name}`}
								onClick={() =>
									forgejoService.deleteUnadopted(name)
								}>
								<Trash2 size={11} />
							</ActionButton>
						</div>
					))}
					{unadopted.length === 0 && (
						<span style={{ color: subText, fontSize: '0.8rem' }}>
							No unadopted repositories.
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
