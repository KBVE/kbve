import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { commands } from '@/bindings';
import { useDevOpsStore } from '@/stores/devopsStore';
import { toast } from '@/stores/toastStore';
import {
	Headphones,
	Play,
	Square,
	Loader2,
	ExternalLink,
	Send,
} from 'lucide-react';

const SUPPORT_SESSION_NAME = 'handy-agent-support-worker';

export const SupportWorker: React.FC = () => {
	const { t } = useTranslation();
	const [isStarting, setIsStarting] = useState(false);
	const [isStopping, setIsStopping] = useState(false);
	const [output, setOutput] = useState<string>('');
	const [loadingOutput, setLoadingOutput] = useState(false);
	const [inputMessage, setInputMessage] = useState('');
	const [isSending, setIsSending] = useState(false);

	const sessions = useDevOpsStore((state) => state.sessions);
	const refreshSessions = useDevOpsStore((state) => state.refreshSessions);

	// Check if support worker session exists
	const supportSession = sessions.find(
		(s) => s.name === SUPPORT_SESSION_NAME,
	);
	const isRunning = !!supportSession;

	// Fetch output when session is running
	useEffect(() => {
		if (!isRunning) {
			void Promise.resolve().then(() => setOutput(''));
			return;
		}

		let isMounted = true;

		const fetchOutput = async () => {
			if (!isMounted) return;
			setLoadingOutput(true);
			try {
				const result = await commands.getTmuxSessionOutput(
					SUPPORT_SESSION_NAME,
					50,
				);
				if (result.status === 'ok' && isMounted) {
					setOutput(result.data);
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
		const interval = setInterval(fetchOutput, 3000);
		return () => {
			isMounted = false;
			clearInterval(interval);
		};
	}, [isRunning]);

	const handleStart = async () => {
		setIsStarting(true);
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
			setIsStarting(false);
		}
	};

	const handleStop = async () => {
		setIsStopping(true);
		try {
			const result = await commands.killTmuxSession(SUPPORT_SESSION_NAME);
			if (result.status === 'ok') {
				await refreshSessions(false);
				toast.success(
					t(
						'devops.supportWorker.success.stopped',
						'Support Worker Stopped',
					),
				);
			} else {
				toast.error(
					t(
						'devops.supportWorker.error.stop',
						'Failed to stop session',
					),
					result.error,
				);
			}
		} catch (err) {
			toast.error(
				t('devops.supportWorker.error.stop', 'Failed to stop'),
				err instanceof Error ? err.message : String(err),
			);
		} finally {
			setIsStopping(false);
		}
	};

	const handleOpenInTerminal = async () => {
		try {
			await commands.attachTmuxSession(SUPPORT_SESSION_NAME);
		} catch (err) {
			toast.error(
				t('devops.supportWorker.error.attach', 'Failed to attach'),
				err instanceof Error ? err.message : String(err),
			);
		}
	};

	const handleSendMessage = async () => {
		if (!inputMessage.trim() || isSending) return;

		setIsSending(true);
		try {
			await commands.sendTmuxCommand(
				SUPPORT_SESSION_NAME,
				inputMessage.trim(),
			);
			setInputMessage('');
		} catch (err) {
			toast.error(
				t('devops.supportWorker.error.send', 'Failed to send message'),
				err instanceof Error ? err.message : String(err),
			);
		} finally {
			setIsSending(false);
		}
	};

	return (
		<div className="space-y-4">
			{/* Header with status and controls */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div
						className={`p-2 rounded-lg ${isRunning ? 'bg-green-500/20 text-green-400' : 'bg-mid-gray/20 text-mid-gray'}`}>
						<Headphones className="w-5 h-5" />
					</div>
					<div>
						<h3 className="font-medium">
							{t('devops.supportWorker.title', 'Support Worker')}
						</h3>
						<p className="text-xs text-mid-gray">
							{isRunning
								? t(
										'devops.supportWorker.running',
										'Agent is running',
									)
								: t(
										'devops.supportWorker.stopped',
										'Agent is stopped',
									)}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					{isRunning ? (
						<>
							<button
								onClick={handleOpenInTerminal}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors"
								title={t('devops.sessions.openTerminal')}>
								<ExternalLink className="w-4 h-4" />
								{t('devops.supportWorker.attach', 'Attach')}
							</button>
							<button
								onClick={handleStop}
								disabled={isStopping}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50">
								{isStopping ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Square className="w-4 h-4" />
								)}
								{t('devops.supportWorker.stop', 'Stop')}
							</button>
						</>
					) : (
						<button
							onClick={handleStart}
							disabled={isStarting}
							className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50">
							{isStarting ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Play className="w-4 h-4" />
							)}
							{t(
								'devops.supportWorker.start',
								'Start Support Worker',
							)}
						</button>
					)}
				</div>
			</div>

			{/* Output preview and input when running */}
			{isRunning && (
				<div className="border border-mid-gray/20 rounded-lg overflow-hidden">
					{/* Output area */}
					<div className="bg-black/40 p-3 max-h-[200px] overflow-auto">
						{loadingOutput && !output ? (
							<div className="flex items-center justify-center py-4">
								<Loader2 className="w-5 h-5 animate-spin text-mid-gray" />
							</div>
						) : (
							<div className="text-xs font-mono text-green-400/80 whitespace-pre-wrap break-all">
								{output || t('devops.sessions.noOutput')}
							</div>
						)}
					</div>

					{/* Send message input */}
					<div className="flex items-center gap-2 p-3 bg-mid-gray/10 border-t border-mid-gray/20">
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
							placeholder={t(
								'devops.supportWorker.inputPlaceholder',
								'Send a message to the support worker...',
							)}
							className="flex-1 px-3 py-2 text-sm bg-background border border-mid-gray/30 rounded-lg focus:outline-none focus:border-logo-primary/50 placeholder:text-mid-gray/50 text-white"
							disabled={isSending}
						/>
						<button
							onClick={handleSendMessage}
							disabled={isSending || !inputMessage.trim()}
							className="flex items-center justify-center p-2 rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							type="button"
							title={t('devops.sessions.send')}>
							{isSending ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Send className="w-4 h-4" />
							)}
						</button>
					</div>
				</div>
			)}

			{/* Description when not running */}
			{!isRunning && (
				<p className="text-sm text-mid-gray/70">
					{t(
						'devops.supportWorker.description',
						'Start a general-purpose Claude agent for support tasks, quick questions, or testing. This worker runs in a tmux session and can be used for any ad-hoc assistance.',
					)}
				</p>
			)}
		</div>
	);
};
