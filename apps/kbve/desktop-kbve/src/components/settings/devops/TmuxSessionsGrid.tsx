import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { commands, TmuxSession } from '@/bindings';
import { useDevOpsStore } from '@/stores/devopsStore';
import { toast } from '@/stores/toastStore';
import {
	Terminal,
	Play,
	Square,
	RefreshCcw,
	Loader2,
	AlertCircle,
	Clock,
	Trash2,
	GitBranch,
	Bot,
	Maximize2,
	Minimize2,
	ExternalLink,
	X,
	Send,
	Headphones,
	CornerDownLeft,
	XCircle,
	ArrowUp,
	ArrowDown,
	Delete,
	RotateCcw,
	AlertTriangle,
} from 'lucide-react';
import { EpicMonitor } from './EpicMonitor';

const SUPPORT_SESSION_NAME = 'handy-agent-support-worker';

interface SessionCardProps {
	session: TmuxSession;
	onKill: (name: string) => void;
	isKilling: boolean;
	onExpand: () => void;
	onRestart: (name: string) => void;
	isRestarting: boolean;
}

const SessionCard: React.FC<SessionCardProps> = ({
	session,
	onKill,
	isKilling,
	onExpand,
	onRestart,
	isRestarting,
}) => {
	const { t } = useTranslation();
	const [output, setOutput] = useState<string>('');
	const [loadingOutput, setLoadingOutput] = useState(false);

	useEffect(() => {
		const fetchOutput = async () => {
			setLoadingOutput(true);
			try {
				const result = await commands.getTmuxSessionOutput(
					session.name,
					20,
				);
				if (result.status === 'ok') {
					setOutput(result.data);
				}
			} catch {
				// Silently fail - output preview is optional
			} finally {
				setLoadingOutput(false);
			}
		};

		fetchOutput();
		// Refresh output every 5 seconds
		const interval = setInterval(fetchOutput, 5000);
		return () => clearInterval(interval);
	}, [session.name]);

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'Running':
				return 'text-green-400 bg-green-500/20';
			case 'Stopped':
				return 'text-yellow-400 bg-yellow-500/20';
			default:
				return 'text-gray-400 bg-gray-500/20';
		}
	};

	const getAgentIcon = (agentType?: string) => {
		switch (agentType) {
			case 'claude':
				return <Bot className="w-4 h-4" />;
			default:
				return <Terminal className="w-4 h-4" />;
		}
	};

	const formatTimestamp = (timestamp: string) => {
		try {
			const date = new Date(timestamp);
			return date.toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit',
			});
		} catch {
			return timestamp;
		}
	};

	const handleOpenInTerminal = async () => {
		try {
			await commands.attachTmuxSession(session.name);
		} catch (err) {
			console.error('Failed to attach to session:', err);
		}
	};

	return (
		<div className="flex flex-col bg-mid-gray/10 rounded-xl border border-mid-gray/20 overflow-hidden hover:border-logo-primary/50 transition-colors">
			{/* Header */}
			<div className="flex items-center gap-3 p-4 border-b border-mid-gray/20">
				<div
					className={`p-2 rounded-lg ${getStatusColor(session.status)}`}>
					{session.status === 'Running' ? (
						<Play className="w-4 h-4" />
					) : (
						<Square className="w-4 h-4" />
					)}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<code className="font-medium text-sm truncate">
							{session.name}
						</code>
						{session.attached && (
							<span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 shrink-0">
								{t('devops.sessions.attached')}
							</span>
						)}
					</div>
					{session.metadata?.agent_type && (
						<div className="flex items-center gap-1 text-xs text-mid-gray mt-0.5">
							{getAgentIcon(session.metadata.agent_type)}
							<span>{session.metadata.agent_type}</span>
						</div>
					)}
				</div>
				<button
					onClick={onExpand}
					className="p-1.5 rounded hover:bg-mid-gray/20 transition-colors"
					title={t('devops.sessions.expand')}>
					<Maximize2 className="w-4 h-4 text-mid-gray" />
				</button>
			</div>

			{/* Metadata */}
			{session.metadata && (
				<div className="px-4 py-2 text-xs text-mid-gray border-b border-mid-gray/10 space-y-1">
					{session.metadata.issue_ref && (
						<div className="flex items-center gap-1.5">
							<GitBranch className="w-3 h-3" />
							<span className="truncate">
								{session.metadata.issue_ref}
							</span>
						</div>
					)}
					{session.metadata.started_at && (
						<div className="flex items-center gap-1.5">
							<Clock className="w-3 h-3" />
							<span>
								{formatTimestamp(session.metadata.started_at)}
							</span>
						</div>
					)}
				</div>
			)}

			{/* Output preview */}
			<div
				className="flex-1 p-3 bg-black/30 min-h-[120px] max-h-[200px] overflow-hidden relative cursor-pointer hover:bg-black/40 transition-colors"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onExpand();
				}}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onExpand();
					}
				}}>
				{loadingOutput && !output ? (
					<div className="flex items-center justify-center h-full pointer-events-none">
						<Loader2 className="w-4 h-4 animate-spin text-mid-gray" />
					</div>
				) : (
					<pre className="text-xs font-mono text-green-400/80 whitespace-pre-wrap break-all overflow-hidden pointer-events-none select-none">
						{output || t('devops.sessions.noOutput')}
					</pre>
				)}
				{/* Gradient fade at bottom */}
				<div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2 p-3 border-t border-mid-gray/20">
				<button
					onClick={handleOpenInTerminal}
					className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-logo-primary/20 hover:bg-logo-primary/30 text-logo-primary transition-colors">
					<ExternalLink className="w-3 h-3" />
					{t('devops.sessions.openTerminal')}
				</button>
				{/* Show restart button for stopped sessions with issue metadata */}
				{session.status === 'Stopped' &&
					session.metadata?.issue_ref && (
						<button
							onClick={() => onRestart(session.name)}
							disabled={isRestarting}
							className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors disabled:opacity-50"
							title={t(
								'devops.sessions.restartAgent',
								'Restart the agent in this session',
							)}>
							{isRestarting ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<RotateCcw className="w-3 h-3" />
							)}
							{t('devops.sessions.restart', 'Restart')}
						</button>
					)}
				<button
					onClick={() => onKill(session.name)}
					disabled={isKilling}
					className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50">
					{isKilling ? (
						<Loader2 className="w-3 h-3 animate-spin" />
					) : (
						<Trash2 className="w-3 h-3" />
					)}
					{t('devops.sessions.kill')}
				</button>
			</div>
		</div>
	);
};

interface ExpandedSessionViewProps {
	sessionName: string;
	onClose: () => void;
	onKill: (name: string) => void;
	isKilling: boolean;
	onRestart: (name: string) => void;
	isRestarting: boolean;
}

const ExpandedSessionView: React.FC<ExpandedSessionViewProps> = ({
	sessionName,
	onClose,
	onKill,
	isKilling,
	onRestart,
	isRestarting,
}) => {
	const { t } = useTranslation();
	const [output, setOutput] = useState<string>('');
	const [loadingOutput, setLoadingOutput] = useState(true);
	const [inputMessage, setInputMessage] = useState('');
	const [isSending, setIsSending] = useState(false);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	// Get the current session data from the store to keep it fresh
	const sessions = useDevOpsStore((state) => state.sessions);
	const session = useMemo(
		() => sessions.find((s) => s.name === sessionName),
		[sessions, sessionName],
	);

	const handleSendMessage = async () => {
		if (!inputMessage.trim() || isSending) return;

		setIsSending(true);
		try {
			await commands.sendTmuxCommand(sessionName, inputMessage.trim());
			setInputMessage('');
		} catch (err) {
			console.error('Failed to send message:', err);
		} finally {
			setIsSending(false);
		}
	};

	const handleSendKeys = async (keys: string) => {
		if (isSending) return;
		setIsSending(true);
		try {
			await commands.sendTmuxKeys(sessionName, keys);
		} catch (err) {
			console.error('Failed to send keys:', err);
		} finally {
			setIsSending(false);
		}
	};

	useEffect(() => {
		let isMounted = true;

		const fetchOutput = async () => {
			if (!isMounted) return;
			try {
				// Fetch more lines for expanded view
				const result = await commands.getTmuxSessionOutput(
					sessionName,
					100,
				);
				if (result.status === 'ok' && isMounted) {
					setOutput(result.data);
					setLastUpdated(new Date());
				}
			} catch {
				// Silently fail
			} finally {
				if (isMounted) {
					setLoadingOutput(false);
				}
			}
		};

		fetchOutput();
		// Refresh output every 2 seconds for expanded view
		const interval = setInterval(fetchOutput, 2000);
		return () => {
			isMounted = false;
			clearInterval(interval);
		};
	}, [sessionName]);

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'Running':
				return 'text-green-400 bg-green-500/20';
			case 'Stopped':
				return 'text-yellow-400 bg-yellow-500/20';
			default:
				return 'text-gray-400 bg-gray-500/20';
		}
	};

	const getAgentIcon = (agentType?: string) => {
		switch (agentType) {
			case 'claude':
				return <Bot className="w-5 h-5" />;
			default:
				return <Terminal className="w-5 h-5" />;
		}
	};

	const formatTimestamp = (timestamp: string) => {
		try {
			const date = new Date(timestamp);
			return date.toLocaleString();
		} catch {
			return timestamp;
		}
	};

	const formatRelativeTime = (date: Date) => {
		const seconds = Math.floor(
			(new Date().getTime() - date.getTime()) / 1000,
		);
		if (seconds < 5) return t('devops.sessions.justNow', 'just now');
		if (seconds < 60)
			return t('devops.sessions.secondsAgo', '{{count}}s ago', {
				count: seconds,
			});
		const minutes = Math.floor(seconds / 60);
		return t('devops.sessions.minutesAgo', '{{count}}m ago', {
			count: minutes,
		});
	};

	const handleOpenInTerminal = async () => {
		try {
			await commands.attachTmuxSession(sessionName);
		} catch (err) {
			console.error('Failed to attach to session:', err);
		}
	};

	// Close on escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [onClose]);

	// If session no longer exists, close the modal
	useEffect(() => {
		if (!session) {
			onClose();
		}
	}, [session, onClose]);

	// Don't render if session doesn't exist
	if (!session) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
			onClick={onClose}>
			<div
				className="bg-background border border-mid-gray/30 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="flex items-center gap-4 p-4 border-b border-mid-gray/20">
					<div
						className={`p-2 rounded-lg ${getStatusColor(session.status)}`}>
						{session.status === 'Running' ? (
							<Play className="w-5 h-5" />
						) : (
							<Square className="w-5 h-5" />
						)}
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<code className="font-semibold text-lg">
								{session.name}
							</code>
							{session.attached && (
								<span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
									{t('devops.sessions.attached')}
								</span>
							)}
						</div>
						{session.metadata?.agent_type && (
							<div className="flex items-center gap-1.5 text-sm text-mid-gray mt-1">
								{getAgentIcon(session.metadata.agent_type)}
								<span>{session.metadata.agent_type}</span>
							</div>
						)}
					</div>
					<button
						onClick={onClose}
						className="p-2 rounded-lg hover:bg-mid-gray/20 transition-colors"
						type="button">
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Metadata bar */}
				<div className="flex items-center gap-6 px-4 py-3 bg-mid-gray/5 border-b border-mid-gray/10 text-sm text-mid-gray">
					{session.metadata?.issue_ref && (
						<div className="flex items-center gap-2">
							<GitBranch className="w-4 h-4" />
							<span>{session.metadata.issue_ref}</span>
						</div>
					)}
					{session.metadata?.started_at && (
						<div className="flex items-center gap-2">
							<Clock className="w-4 h-4" />
							<span
								title={t(
									'devops.sessions.startedAt',
									'Started at',
								)}>
								{formatTimestamp(session.metadata.started_at)}
							</span>
						</div>
					)}
					{session.metadata?.worktree && (
						<div className="flex items-center gap-2 truncate">
							<Terminal className="w-4 h-4 shrink-0" />
							<span className="truncate">
								{session.metadata.worktree}
							</span>
						</div>
					)}
					{/* Last updated indicator */}
					<div className="flex items-center gap-2 ml-auto">
						<RefreshCcw
							className={`w-3 h-3 ${loadingOutput ? 'animate-spin' : ''}`}
						/>
						<span className="text-xs">
							{lastUpdated
								? formatRelativeTime(lastUpdated)
								: t('devops.sessions.updating', 'updating...')}
						</span>
					</div>
				</div>

				{/* Output area - scrollable */}
				<div className="flex-1 overflow-auto bg-black/40 p-4 min-h-[200px] max-h-[50vh]">
					{loadingOutput && !output ? (
						<div className="flex items-center justify-center h-full">
							<Loader2 className="w-6 h-6 animate-spin text-mid-gray" />
						</div>
					) : (
						<div className="text-sm font-mono text-green-400/90 whitespace-pre-wrap break-words">
							{output || t('devops.sessions.noOutput')}
						</div>
					)}
				</div>

				{/* Send message input */}
				<div className="flex flex-col gap-2 px-4 py-3 bg-mid-gray/10 border-t border-mid-gray/20 shrink-0">
					{/* Quick action buttons */}
					<div className="flex items-center gap-1.5">
						<span className="text-xs text-mid-gray/70 mr-1">
							{t('devops.sessions.quickKeys', 'Quick keys:')}
						</span>
						<button
							onClick={() => handleSendKeys('Enter')}
							disabled={isSending}
							className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors disabled:opacity-50"
							type="button"
							title="Enter">
							<CornerDownLeft className="w-3 h-3" />
							Enter
						</button>
						<button
							onClick={() => handleSendKeys('C-c')}
							disabled={isSending}
							className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
							type="button"
							title="Ctrl+C (Cancel)">
							<XCircle className="w-3 h-3" />
							Ctrl+C
						</button>
						<button
							onClick={() => handleSendKeys('Escape')}
							disabled={isSending}
							className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors disabled:opacity-50"
							type="button"
							title="Escape">
							Esc
						</button>
						<button
							onClick={() => handleSendKeys('Up')}
							disabled={isSending}
							className="flex items-center justify-center p-1 text-xs rounded bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors disabled:opacity-50"
							type="button"
							title="Up Arrow">
							<ArrowUp className="w-3 h-3" />
						</button>
						<button
							onClick={() => handleSendKeys('Down')}
							disabled={isSending}
							className="flex items-center justify-center p-1 text-xs rounded bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors disabled:opacity-50"
							type="button"
							title="Down Arrow">
							<ArrowDown className="w-3 h-3" />
						</button>
						<button
							onClick={() => handleSendKeys('BSpace')}
							disabled={isSending}
							className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors disabled:opacity-50"
							type="button"
							title="Backspace">
							<Delete className="w-3 h-3" />
						</button>
					</div>
					{/* Input row */}
					<div className="flex items-center gap-2">
						<input
							type="text"
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									handleSendMessage();
								}
							}}
							placeholder={t('devops.sessions.sendPlaceholder')}
							className="flex-1 px-3 py-2 text-sm bg-background border border-mid-gray/30 rounded-lg focus:outline-none focus:border-logo-primary/50 placeholder:text-mid-gray/50 text-white"
							disabled={isSending}
						/>
						<button
							onClick={handleSendMessage}
							disabled={isSending || !inputMessage.trim()}
							className="flex items-center justify-center p-2.5 rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							type="button"
							title={t('devops.sessions.send')}>
							{isSending ? (
								<Loader2 className="w-5 h-5 animate-spin" />
							) : (
								<Send className="w-5 h-5" />
							)}
						</button>
					</div>
				</div>

				{/* Actions */}
				<div className="flex items-center justify-between gap-4 p-4 border-t border-mid-gray/20">
					<div className="flex items-center gap-2">
						<button
							onClick={handleOpenInTerminal}
							className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors"
							type="button">
							<ExternalLink className="w-4 h-4" />
							{t('devops.sessions.openTerminal')}
						</button>
						{/* Show restart button for stopped sessions with issue metadata */}
						{session.status === 'Stopped' &&
							session.metadata?.issue_ref && (
								<button
									onClick={() => onRestart(session.name)}
									disabled={isRestarting}
									className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors disabled:opacity-50"
									type="button"
									title={t(
										'devops.sessions.restartAgent',
										'Restart the agent in this session',
									)}>
									{isRestarting ? (
										<Loader2 className="w-4 h-4 animate-spin" />
									) : (
										<RotateCcw className="w-4 h-4" />
									)}
									{t('devops.sessions.restart', 'Restart')}
								</button>
							)}
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={onClose}
							className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors"
							type="button">
							<Minimize2 className="w-4 h-4" />
							{t('devops.sessions.collapse')}
						</button>
						<button
							onClick={() => onKill(session.name)}
							disabled={isKilling}
							className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
							type="button">
							{isKilling ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Trash2 className="w-4 h-4" />
							)}
							{t('devops.sessions.kill')}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export const TmuxSessionsGrid: React.FC = () => {
	const { t } = useTranslation();
	const [expandedSessionName, setExpandedSessionName] = useState<
		string | null
	>(null);
	const [isStartingSupportWorker, setIsStartingSupportWorker] =
		useState(false);
	const [restartingSession, setRestartingSession] = useState<string | null>(
		null,
	);

	const sessions = useDevOpsStore((state) => state.sessions);
	const isLoading = useDevOpsStore((state) => state.sessionsLoading);
	const isTmuxRunning = useDevOpsStore((state) => state.isTmuxRunning);
	const error = useDevOpsStore((state) => state.sessionsError);
	const killingSession = useDevOpsStore((state) => state.killingSession);

	const refreshSessions = useDevOpsStore((state) => state.refreshSessions);
	const killSession = useDevOpsStore((state) => state.killSession);

	// Count stopped sessions that can be restarted
	const stoppedSessions = sessions.filter(
		(s) => s.status === 'Stopped' && s.metadata?.issue_ref,
	);

	// Handler for restarting an agent in a session
	const handleRestartAgent = async (sessionName: string) => {
		setRestartingSession(sessionName);
		try {
			const result = await commands.restartAgentInSession(sessionName);
			if (result.status === 'ok') {
				toast.success(
					t('devops.sessions.restartSuccess', 'Agent Restarted'),
					t(
						'devops.sessions.restartSuccessMessage',
						'The agent has been restarted in session {{session}}',
						{ session: sessionName },
					),
				);
				// Refresh to update status
				await refreshSessions(false);
			} else {
				toast.error(
					t('devops.sessions.restartError', 'Failed to Restart'),
					result.error,
				);
			}
		} catch (err) {
			toast.error(
				t('devops.sessions.restartError', 'Failed to Restart'),
				err instanceof Error ? err.message : String(err),
			);
		} finally {
			setRestartingSession(null);
		}
	};

	// Handler for recovering all stopped sessions
	const handleRecoverAll = async () => {
		try {
			const result = await commands.recoverAllAgentSessions(true, false);
			if (result.status === 'ok') {
				const succeeded = result.data.filter((r) => r.success).length;
				const failed = result.data.filter((r) => !r.success).length;
				if (succeeded > 0) {
					toast.success(
						t(
							'devops.sessions.recoverySuccess',
							'Recovery Complete',
						),
						t(
							'devops.sessions.recoverySuccessMessage',
							'Restarted {{count}} agent(s)',
							{ count: succeeded },
						),
					);
				}
				if (failed > 0) {
					toast.warning(
						t('devops.sessions.recoveryPartial', 'Some Failed'),
						t(
							'devops.sessions.recoveryPartialMessage',
							'{{count}} agent(s) could not be restarted',
							{ count: failed },
						),
					);
				}
				await refreshSessions(false);
			} else {
				toast.error(
					t('devops.sessions.recoveryError', 'Recovery Failed'),
					result.error,
				);
			}
		} catch (err) {
			toast.error(
				t('devops.sessions.recoveryError', 'Recovery Failed'),
				err instanceof Error ? err.message : String(err),
			);
		}
	};

	// Check if support worker is running
	const supportWorkerSession = sessions.find(
		(s) => s.name === SUPPORT_SESSION_NAME,
	);
	const isSupportWorkerRunning = !!supportWorkerSession;

	const handleStartSupportWorker = async () => {
		setIsStartingSupportWorker(true);
		try {
			// Ensure tmux server is running first
			const masterResult = await commands.ensureMasterTmuxSession();
			if (masterResult.status === 'error') {
				toast.error(
					t(
						'devops.supportWorker.error.masterSession',
						'Failed to start tmux',
					),
					masterResult.error,
				);
				return;
			}

			// Create a tmux session with claude as the agent
			const result = await commands.createTmuxSession(
				SUPPORT_SESSION_NAME,
				null, // working_dir - use current
				null, // issue_ref
				null, // repo
				'claude', // agent_type
			);

			if (result.status === 'ok') {
				// Send the initial command to start claude
				await commands.sendTmuxCommand(SUPPORT_SESSION_NAME, 'claude');
				// Refresh sessions to pick up the new one
				await refreshSessions(false);
				toast.success(
					t(
						'devops.supportWorker.success.started',
						'Support Worker Started',
					),
					t(
						'devops.supportWorker.success.startedMessage',
						'Claude agent is now running',
					),
				);
			} else {
				toast.error(
					t(
						'devops.supportWorker.error.create',
						'Failed to create session',
					),
					result.error,
				);
			}
		} catch (err) {
			toast.error(
				t('devops.supportWorker.error.start', 'Failed to start'),
				err instanceof Error ? err.message : String(err),
			);
		} finally {
			setIsStartingSupportWorker(false);
		}
	};

	// tmux not running
	if (!isTmuxRunning && !isLoading) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<Terminal className="w-16 h-16 text-mid-gray/30 mb-4" />
				<p className="text-lg text-mid-gray mb-2">
					{t('devops.sessions.tmuxNotRunning')}
				</p>
				<p className="text-sm text-mid-gray/70 max-w-md">
					{t('devops.sessions.tmuxNotRunningHint')}
				</p>
			</div>
		);
	}

	// Loading state
	if (isLoading && sessions.length === 0) {
		return (
			<div className="flex items-center justify-center py-16">
				<Loader2 className="w-8 h-8 animate-spin text-logo-primary" />
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<AlertCircle className="w-12 h-12 text-red-400 mb-4" />
				<p className="text-red-400 mb-4">{error}</p>
				<button
					onClick={() => refreshSessions(true)}
					className="flex items-center gap-2 px-4 py-2 rounded bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors">
					<RefreshCcw className="w-4 h-4" />
					{t('devops.refresh')}
				</button>
			</div>
		);
	}

	// No sessions
	if (sessions.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<Terminal className="w-16 h-16 text-mid-gray/30 mb-4" />
				<p className="text-lg text-mid-gray mb-2">
					{t('devops.sessions.noSessions')}
				</p>
				<p className="text-sm text-mid-gray/70 max-w-md mb-6">
					{t('devops.sessions.noSessionsHint')}
				</p>
				<button
					onClick={handleStartSupportWorker}
					disabled={isStartingSupportWorker}
					className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50">
					{isStartingSupportWorker ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						<Headphones className="w-4 h-4" />
					)}
					{t('devops.supportWorker.start', 'Start Support Worker')}
				</button>
			</div>
		);
	}

	return (
		<>
			<div className="space-y-4">
				{/* Recovery banner for stopped sessions */}
				{stoppedSessions.length > 0 && (
					<div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
						<AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
						<div className="flex-1">
							<p className="text-sm text-yellow-400 font-medium">
								{t(
									'devops.sessions.stoppedAgents',
									'{{count}} stopped agent(s) detected',
									{ count: stoppedSessions.length },
								)}
							</p>
							<p className="text-xs text-yellow-400/70">
								{t(
									'devops.sessions.stoppedAgentsHint',
									'These sessions have agents that stopped. You can restart them to continue work.',
								)}
							</p>
						</div>
						<button
							onClick={handleRecoverAll}
							disabled={restartingSession !== null}
							className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors disabled:opacity-50">
							{restartingSession !== null ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<RotateCcw className="w-4 h-4" />
							)}
							{t('devops.sessions.restartAll', 'Restart All')}
						</button>
					</div>
				)}

				{/* Epic Monitor - Supervisor for sub-agents */}
				<EpicMonitor />

				{/* Header */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="text-sm text-mid-gray">
							{t('devops.sessions.activeCount', {
								count: sessions.length,
							})}
						</span>
						{isLoading && (
							<Loader2 className="w-4 h-4 animate-spin text-mid-gray" />
						)}
					</div>
					<div className="flex items-center gap-2">
						{!isSupportWorkerRunning && (
							<button
								onClick={handleStartSupportWorker}
								disabled={isStartingSupportWorker}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50">
								{isStartingSupportWorker ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Headphones className="w-4 h-4" />
								)}
								{t(
									'devops.supportWorker.start',
									'Start Support Worker',
								)}
							</button>
						)}
						<button
							onClick={() => refreshSessions(false)}
							disabled={isLoading}
							className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-mid-gray/20 transition-colors disabled:opacity-50">
							<RefreshCcw
								className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
							/>
							{t('devops.refresh')}
						</button>
					</div>
				</div>

				{/* Bento grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{sessions.map((session) => (
						<SessionCard
							key={session.name}
							session={session}
							onKill={killSession}
							isKilling={killingSession === session.name}
							onExpand={() =>
								setExpandedSessionName(session.name)
							}
							onRestart={handleRestartAgent}
							isRestarting={restartingSession === session.name}
						/>
					))}
				</div>
			</div>

			{/* Expanded session modal */}
			{expandedSessionName && (
				<ExpandedSessionView
					key={expandedSessionName}
					sessionName={expandedSessionName}
					onClose={() => setExpandedSessionName(null)}
					onKill={(name) => {
						killSession(name);
						setExpandedSessionName(null);
					}}
					isKilling={killingSession === expandedSessionName}
					onRestart={handleRestartAgent}
					isRestarting={restartingSession === expandedSessionName}
				/>
			)}
		</>
	);
};
