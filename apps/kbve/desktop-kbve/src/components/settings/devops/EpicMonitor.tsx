import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useDevOpsStore } from '@/stores/devopsStore';
import { toast } from '@/stores/toastStore';
import {
	Eye,
	Play,
	Square,
	Loader2,
	RefreshCw,
	CheckCircle,
	Clock,
	CheckCheck,
	Pause,
	SkipForward,
	GitPullRequest,
	GitMerge,
	ExternalLink,
} from 'lucide-react';

export const EpicMonitor: React.FC = () => {
	const { t } = useTranslation();
	const {
		activeEpic,
		epicLoading,
		epicMonitor,
		epicMonitorChecking,
		startEpicMonitoring,
		stopEpicMonitoring,
		checkEpicCompletions,
		setEpicMonitorAutoUpdate,
		setEpicMonitorAutoStartNextPhase,
		markPhaseStatus,
	} = useDevOpsStore();

	const [markingPhase, setMarkingPhase] = useState<number | null>(null);
	const [mergingIssue, setMergingIssue] = useState<number | null>(null);
	const [mergingAll, setMergingAll] = useState(false);

	// Handle merging a single PR
	const handleMergePR = async (issueNumber: number) => {
		setMergingIssue(issueNumber);
		try {
			const result = await invoke<{
				success: boolean;
				error?: string;
				phase_complete: boolean;
				next_phase?: number;
			}>('merge_ready_pr', {
				issueNumber,
				mergeMethod: 'squash',
				deleteBranch: true,
			});

			if (result.success) {
				toast.success(
					t('devops.epicMonitor.mergePRSuccess'),
					result.phase_complete
						? t('devops.epicMonitor.phaseCompleteMessage', {
								nextPhase: result.next_phase,
							})
						: undefined,
				);
				// Refresh the epic state
				checkEpicCompletions();
			} else {
				toast.error(
					t('devops.epicMonitor.mergePRFailed'),
					result.error,
				);
			}
		} catch (err) {
			toast.error(t('devops.epicMonitor.mergePRFailed'), String(err));
		} finally {
			setMergingIssue(null);
		}
	};

	// Handle merging all ready PRs
	const handleMergeAllReady = async () => {
		setMergingAll(true);
		try {
			const result = await invoke<{
				merges: Array<{
					success: boolean;
					issue_number: number;
					error?: string;
				}>;
				completed_phases: number[];
				next_phase?: number;
			}>('process_ready_prs', {
				mergeMethod: 'squash',
				deleteBranch: true,
				autoStartNextPhase: false, // For now, don't auto-start - let user decide
			});

			const successCount = result.merges.filter((m) => m.success).length;
			const failCount = result.merges.filter((m) => !m.success).length;

			if (successCount > 0) {
				toast.success(
					t('devops.epicMonitor.mergeAllSuccess', {
						count: successCount,
					}),
					result.completed_phases.length > 0
						? t('devops.epicMonitor.phasesCompleted', {
								phases: result.completed_phases.join(', '),
							})
						: undefined,
				);
			}
			if (failCount > 0) {
				toast.warning(
					t('devops.epicMonitor.mergeAllPartialFail', {
						count: failCount,
					}),
				);
			}

			// Refresh the epic state
			checkEpicCompletions();
		} catch (err) {
			toast.error(t('devops.epicMonitor.mergeAllFailed'), String(err));
		} finally {
			setMergingAll(false);
		}
	};

	const handleStartMonitoring = () => {
		startEpicMonitoring();
		toast.info(
			t('devops.epicMonitor.started'),
			t('devops.epicMonitor.startedMessage'),
		);
	};

	const handleStopMonitoring = () => {
		stopEpicMonitoring();
		toast.info(t('devops.epicMonitor.stopped'));
	};

	const handleMarkPhase = async (phaseNumber: number, status: string) => {
		setMarkingPhase(phaseNumber);
		try {
			await markPhaseStatus(phaseNumber, status);
			toast.success(
				t('devops.epicMonitor.phaseUpdated'),
				t('devops.epicMonitor.phaseUpdatedMessage', {
					phase: phaseNumber,
					status,
				}),
			);
		} catch {
			toast.error(t('devops.epicMonitor.phaseUpdateFailed'));
		} finally {
			setMarkingPhase(null);
		}
	};

	// Get phase status icon and color
	const getPhaseStatusInfo = (status: string) => {
		switch (status) {
			case 'completed':
				return {
					icon: CheckCircle,
					color: 'text-green-400',
					bgColor: 'bg-green-500/10',
				};
			case 'ready':
				return {
					icon: GitPullRequest,
					color: 'text-yellow-400',
					bgColor: 'bg-yellow-500/10',
				};
			case 'in_progress':
				return {
					icon: Clock,
					color: 'text-blue-400',
					bgColor: 'bg-blue-500/10',
				};
			case 'skipped':
				return {
					icon: SkipForward,
					color: 'text-gray-400',
					bgColor: 'bg-gray-500/10',
				};
			default:
				return {
					icon: Pause,
					color: 'text-mid-gray',
					bgColor: 'bg-mid-gray/10',
				};
		}
	};

	// Helper to check state (GitHub returns uppercase, normalize for comparison)
	const isOpen = (state: string) => state.toLowerCase() === 'open';
	const isClosed = (state: string) => state.toLowerCase() === 'closed';

	// Debug: Log the sub-issues to understand state
	if (activeEpic) {
		console.log('[EpicMonitor] sub_issues:', activeEpic.sub_issues);
		console.log(
			'[EpicMonitor] sub_issues details:',
			activeEpic.sub_issues.map((s) => ({
				issue: s.issue_number,
				state: s.state,
				stateLC: s.state.toLowerCase(),
				isOpen: isOpen(s.state),
				has_agent: s.has_agent_working,
				pr_url: s.pr_url,
			})),
		);
	}

	// Count sub-issues by state
	// In Progress: Agent is working, no PR yet
	const inProgressCount = activeEpic
		? activeEpic.sub_issues.filter(
				(s) => isOpen(s.state) && s.has_agent_working && !s.pr_url,
			).length
		: 0;

	// Ready: PR created, awaiting review/merge (work is done, ready for human review)
	const readyCount = activeEpic
		? activeEpic.sub_issues.filter((s) => isOpen(s.state) && s.pr_url)
				.length
		: 0;

	// Queued: Open issues with no agent assigned and no PR (waiting to be picked up)
	const queuedCount = activeEpic
		? activeEpic.sub_issues.filter(
				(s) => isOpen(s.state) && !s.has_agent_working && !s.pr_url,
			).length
		: 0;

	// Completed: Issue is closed (PR merged)
	const completedCount = activeEpic
		? activeEpic.sub_issues.filter((s) => isClosed(s.state)).length
		: 0;

	// Total active agents (for header display)
	const activeAgentCount = activeEpic
		? activeEpic.sub_issues.filter((s) => s.has_agent_working).length
		: 0;

	if (!activeEpic) {
		return (
			<div className="p-4 bg-mid-gray/10 border border-mid-gray/20 rounded-lg">
				<div className="flex items-center gap-3 text-mid-gray">
					<Eye className="w-5 h-5" />
					<div>
						<p className="font-medium">
							{t('devops.epicMonitor.title')}
						</p>
						<p className="text-xs">
							{t('devops.epicMonitor.linkHint')}
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Header with status and controls */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div
						className={`p-2 rounded-lg ${
							epicMonitor.isMonitoring
								? 'bg-green-500/20 text-green-400'
								: 'bg-mid-gray/20 text-mid-gray'
						}`}>
						<Eye className="w-5 h-5" />
					</div>
					<div>
						<h3 className="font-medium">
							{t('devops.epicMonitor.title')}
							{activeEpic && (
								<span className="ml-2 text-xs text-mid-gray font-normal">
									#{activeEpic.epic_number}
								</span>
							)}
						</h3>
						<p className="text-xs text-mid-gray">
							{epicMonitor.isMonitoring
								? t('devops.epicMonitor.watching')
								: t('devops.epicMonitor.description')}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					{epicMonitor.isMonitoring ? (
						<>
							<button
								onClick={checkEpicCompletions}
								disabled={epicMonitorChecking}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-mid-gray/20 hover:bg-mid-gray/30 transition-colors disabled:opacity-50"
								title={t('devops.epicMonitor.checkNow')}>
								{epicMonitorChecking ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<RefreshCw className="w-4 h-4" />
								)}
								{t('devops.epicMonitor.check')}
							</button>
							<button
								onClick={handleStopMonitoring}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors">
								<Square className="w-4 h-4" />
								{t('devops.epicMonitor.stop')}
							</button>
						</>
					) : (
						<button
							onClick={handleStartMonitoring}
							disabled={epicLoading}
							className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-logo-primary hover:bg-logo-primary/80 text-white transition-colors disabled:opacity-50">
							{epicLoading ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Play className="w-4 h-4" />
							)}
							{t('devops.epicMonitor.startMonitoring')}
						</button>
					)}
				</div>
			</div>

			{/* Status dashboard */}
			<div className="grid grid-cols-4 gap-3">
				{/* In Progress: Agent working, no PR yet */}
				<div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
					<div className="flex items-center gap-2 text-blue-400">
						<Clock className="w-4 h-4" />
						<span className="text-xs">
							{t('devops.epicMonitor.inProgress')}
						</span>
					</div>
					<p className="text-xl font-bold text-white mt-1">
						{inProgressCount}
					</p>
				</div>

				{/* Ready: PR created, awaiting review/merge */}
				<div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
					<div className="flex items-center gap-2 text-yellow-400">
						<GitPullRequest className="w-4 h-4" />
						<span className="text-xs">
							{t('devops.epicMonitor.ready')}
						</span>
					</div>
					<p className="text-xl font-bold text-white mt-1">
						{readyCount}
					</p>
				</div>

				{/* Completed: Issue closed (PR merged) */}
				<div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
					<div className="flex items-center gap-2 text-green-400">
						<CheckCircle className="w-4 h-4" />
						<span className="text-xs">
							{t('devops.epicMonitor.completed')}
						</span>
					</div>
					<p className="text-xl font-bold text-white mt-1">
						{completedCount}
					</p>
				</div>

				{/* Queued: Waiting to be picked up */}
				<div className="p-3 bg-mid-gray/10 border border-mid-gray/20 rounded-lg">
					<div className="flex items-center gap-2 text-mid-gray">
						<Pause className="w-4 h-4" />
						<span className="text-xs">
							{t('devops.epicMonitor.queued')}
						</span>
					</div>
					<p className="text-xl font-bold text-white mt-1">
						{queuedCount}
					</p>
				</div>
			</div>

			{/* Options */}
			<div className="flex flex-col gap-2 p-3 bg-mid-gray/10 border border-mid-gray/20 rounded-lg">
				<div className="flex items-center justify-between">
					<label className="flex items-center gap-2 text-sm cursor-pointer">
						<input
							type="checkbox"
							checked={epicMonitor.autoUpdateGithub}
							onChange={(e) =>
								setEpicMonitorAutoUpdate(e.target.checked)
							}
							className="rounded border-mid-gray/30 bg-mid-gray/10 text-logo-primary focus:ring-logo-primary"
						/>
						{t('devops.epicMonitor.autoUpdateGithub')}
					</label>

					{epicMonitor.lastCheck && (
						<span className="text-xs text-mid-gray">
							{t('devops.epicMonitor.lastCheck', {
								time: epicMonitor.lastCheck.toLocaleTimeString(),
							})}
						</span>
					)}
				</div>

				<label className="flex items-center gap-2 text-sm cursor-pointer">
					<input
						type="checkbox"
						checked={epicMonitor.autoStartNextPhase}
						onChange={(e) =>
							setEpicMonitorAutoStartNextPhase(e.target.checked)
						}
						className="rounded border-mid-gray/30 bg-mid-gray/10 text-logo-primary focus:ring-logo-primary"
					/>
					{t('devops.epicMonitor.autoStartNextPhase')}
				</label>
			</div>

			{/* Phase status list */}
			{activeEpic.phases.length > 0 && (
				<div className="space-y-2">
					<h4 className="text-sm font-medium text-mid-gray">
						{t('devops.epicMonitor.phases')}
					</h4>
					<div className="space-y-2">
						{activeEpic.phases.map((phase) => {
							const {
								icon: StatusIcon,
								color,
								bgColor,
							} = getPhaseStatusInfo(phase.status);
							const isMarking =
								markingPhase === phase.phase_number;

							return (
								<div
									key={phase.phase_number}
									className={`flex items-center justify-between p-3 rounded-lg border border-mid-gray/20 ${bgColor}`}>
									<div className="flex items-center gap-3">
										<StatusIcon
											className={`w-5 h-5 ${color}`}
										/>
										<div>
											<p className="text-sm font-medium text-white">
												{t(
													'devops.epicMonitor.phaseNumber',
													{
														number: phase.phase_number,
													},
												)}
												: {phase.name}
											</p>
											<p className="text-xs text-mid-gray capitalize">
												{phase.status.replace('_', ' ')}
												{phase.total_count > 0 &&
													` (${phase.completed_count}/${phase.total_count})`}
											</p>
										</div>
									</div>

									{/* Mark as complete button (only show if not already completed) */}
									{phase.status !== 'completed' && (
										<button
											onClick={() =>
												handleMarkPhase(
													phase.phase_number,
													'completed',
												)
											}
											disabled={isMarking || epicLoading}
											className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors disabled:opacity-50"
											title={t(
												'devops.epicMonitor.markComplete',
											)}>
											{isMarking ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<CheckCheck className="w-3 h-3" />
											)}
											{t(
												'devops.epicMonitor.markComplete',
											)}
										</button>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Active agents list */}
			{activeAgentCount > 0 && (
				<div className="space-y-2">
					<h4 className="text-sm font-medium text-mid-gray">
						{t('devops.epicMonitor.activeAgents')}
					</h4>
					<div className="space-y-1">
						{activeEpic.sub_issues
							.filter((s) => s.has_agent_working)
							.map((subIssue) => (
								<div
									key={subIssue.issue_number}
									className="flex items-center gap-2 p-2 bg-mid-gray/10 rounded text-sm">
									<div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
									<a
										href={subIssue.url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-blue-400 hover:text-blue-300">
										#{subIssue.issue_number}
									</a>
									<span className="text-mid-gray">-</span>
									<span className="text-white truncate flex-1">
										{subIssue.title}
									</span>
									{subIssue.session_name && (
										<span className="text-xs text-mid-gray bg-mid-gray/20 px-2 py-0.5 rounded">
											{subIssue.session_name}
										</span>
									)}
								</div>
							))}
					</div>
				</div>
			)}

			{/* Ready PRs list - PRs that are ready to merge */}
			{readyCount > 0 && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h4 className="text-sm font-medium text-mid-gray">
							{t('devops.epicMonitor.readyPRs')}
						</h4>
						<button
							onClick={handleMergeAllReady}
							disabled={mergingAll || mergingIssue !== null}
							className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors disabled:opacity-50">
							{mergingAll ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<GitMerge className="w-3 h-3" />
							)}
							{t('devops.epicMonitor.mergeAll')}
						</button>
					</div>
					<div className="space-y-1">
						{activeEpic.sub_issues
							.filter((s) => isOpen(s.state) && s.pr_url)
							.map((subIssue) => (
								<div
									key={subIssue.issue_number}
									className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
									<GitPullRequest className="w-4 h-4 text-yellow-400" />
									<a
										href={subIssue.url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-blue-400 hover:text-blue-300">
										#{subIssue.issue_number}
									</a>
									<span className="text-mid-gray">-</span>
									<span className="text-white truncate flex-1">
										{subIssue.title}
									</span>

									{/* PR link */}
									{subIssue.pr_url && (
										<a
											href={subIssue.pr_url}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-1 text-xs text-mid-gray hover:text-white"
											title={t(
												'devops.epicMonitor.viewPR',
											)}>
											<ExternalLink className="w-3 h-3" />
											PR
										</a>
									)}

									{/* Merge button */}
									<button
										onClick={() =>
											handleMergePR(subIssue.issue_number)
										}
										disabled={
											mergingIssue !== null || mergingAll
										}
										className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors disabled:opacity-50"
										title={t('devops.epicMonitor.mergePR')}>
										{mergingIssue ===
										subIssue.issue_number ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<GitMerge className="w-3 h-3" />
										)}
										{t('devops.epicMonitor.merge')}
									</button>
								</div>
							))}
					</div>
				</div>
			)}
		</div>
	);
};
