import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
	commands,
	AgentStatus,
	TmuxSession,
	RecoveredSession,
	ActiveEpicState,
	EpicInfo,
	EpicRecoveryInfo,
} from '@/bindings';

import { toast } from '@/stores/toastStore';

// Event payload for PR creation
interface AgentPrCreatedEvent {
	session: string;
	issue_number: number;
	pr_url: string;
	pr_number: number | null;
	repo: string;
}

// Event payload for orphan container cleanup
interface OrphanContainerCleanedEvent {
	container_name: string;
	issue_number: number | null;
}

// Epic Monitor state for supervisor functionality
export interface EpicMonitorState {
	isMonitoring: boolean;
	lastCheck: Date | null;
	completedSinceStart: number;
	autoUpdateGithub: boolean;
	autoStartNextPhase: boolean;
}

interface DevOpsStore {
	// Agent state
	agents: AgentStatus[];
	agentsLoading: boolean;
	agentsError: string | null;

	// Tmux session state
	sessions: TmuxSession[];
	recoveredSessions: RecoveredSession[];
	sessionsLoading: boolean;
	sessionsError: string | null;
	isTmuxRunning: boolean;

	// Epic state (persisted across tab switches and app restarts)
	activeEpic: ActiveEpicState | null;
	epicLoading: boolean;
	epicError: string | null;

	// Epic Monitor state (supervisor for sub-agents)
	epicMonitor: EpicMonitorState;
	epicMonitorChecking: boolean;

	// Current machine ID
	currentMachineId: string;

	// Filter state
	agentFilterMode: 'all' | 'local' | 'remote';

	// Loading states for individual operations
	killingSession: string | null;
	cleaningUpAgent: string | null;
	completingWork: string | null;

	// Actions
	initialize: () => Promise<void>;
	cleanup: () => void;

	// Agent actions
	refreshAgents: (showLoading?: boolean) => Promise<void>;
	setAgentFilterMode: (mode: 'all' | 'local' | 'remote') => void;
	cleanupAgent: (
		agent: AgentStatus,
		removeWorktree: boolean,
	) => Promise<void>;
	completeAgentWork: (agent: AgentStatus, prTitle: string) => Promise<void>;

	// Session actions
	refreshSessions: (showLoading?: boolean) => Promise<void>;
	killSession: (sessionName: string) => Promise<void>;

	// Epic actions
	loadActiveEpic: () => Promise<void>;
	setActiveEpic: (epic: EpicInfo) => Promise<void>;
	setActiveEpicFromRecovery: (recovery: EpicRecoveryInfo) => Promise<void>;
	syncActiveEpic: () => Promise<void>;
	clearActiveEpic: (archive?: boolean) => Promise<void>;
	markPhaseStatus: (phaseNumber: number, status: string) => Promise<void>;

	// Epic Monitor actions
	startEpicMonitoring: () => void;
	stopEpicMonitoring: () => void;
	checkEpicCompletions: () => Promise<void>;
	setEpicMonitorAutoUpdate: (enabled: boolean) => void;
	setEpicMonitorAutoStartNextPhase: (enabled: boolean) => void;
	incrementCompletedCount: (count?: number) => void;

	// Internal setters
	setAgents: (agents: AgentStatus[]) => void;
	setAgentsLoading: (loading: boolean) => void;
	setAgentsError: (error: string | null) => void;
	setSessions: (sessions: TmuxSession[]) => void;
	setRecoveredSessions: (sessions: RecoveredSession[]) => void;
	setSessionsLoading: (loading: boolean) => void;
	setSessionsError: (error: string | null) => void;
	setIsTmuxRunning: (running: boolean) => void;

	// Interval IDs for cleanup
	_agentRefreshInterval: number | null;
	_sessionRefreshInterval: number | null;
	_epicMonitorInterval: number | null;
	_orphanCleanupInterval: number | null;
	_prEventUnlisten: UnlistenFn | null;
	_orphanEventUnlisten: UnlistenFn | null;
	_previousSubIssueStates: Map<number, string>;
	_mergeWorkersSpawned: Set<number>; // Track issues with merge workers already spawned
	_setAgentRefreshInterval: (id: number | null) => void;
	_setSessionRefreshInterval: (id: number | null) => void;
	_setEpicMonitorInterval: (id: number | null) => void;
	_setOrphanCleanupInterval: (id: number | null) => void;
}

export const useDevOpsStore = create<DevOpsStore>()(
	subscribeWithSelector((set, get) => ({
		// Initial state
		agents: [],
		agentsLoading: true,
		agentsError: null,

		sessions: [],
		recoveredSessions: [],
		sessionsLoading: true,
		sessionsError: null,
		isTmuxRunning: false,

		// Epic state (persisted via tauri-plugin-store)
		activeEpic: null,
		epicLoading: false,
		epicError: null,

		// Epic Monitor state
		epicMonitor: {
			isMonitoring: false,
			lastCheck: null,
			completedSinceStart: 0,
			autoUpdateGithub: true,
			autoStartNextPhase: false, // Default to false for safety
		},
		epicMonitorChecking: false,

		currentMachineId: '',

		agentFilterMode: 'all',

		killingSession: null,
		cleaningUpAgent: null,
		completingWork: null,

		_agentRefreshInterval: null,
		_sessionRefreshInterval: null,
		_epicMonitorInterval: null,
		_orphanCleanupInterval: null,
		_prEventUnlisten: null,
		_orphanEventUnlisten: null,
		_previousSubIssueStates: new Map(),
		_mergeWorkersSpawned: new Set(),

		// Internal setters
		setAgents: (agents) => set({ agents }),
		setAgentsLoading: (agentsLoading) => set({ agentsLoading }),
		setAgentsError: (agentsError) => set({ agentsError }),
		setSessions: (sessions) => set({ sessions }),
		setRecoveredSessions: (recoveredSessions) => set({ recoveredSessions }),
		setSessionsLoading: (sessionsLoading) => set({ sessionsLoading }),
		setSessionsError: (sessionsError) => set({ sessionsError }),
		setIsTmuxRunning: (isTmuxRunning) => set({ isTmuxRunning }),
		setAgentFilterMode: (agentFilterMode) => set({ agentFilterMode }),
		_setAgentRefreshInterval: (id) => set({ _agentRefreshInterval: id }),
		_setSessionRefreshInterval: (id) =>
			set({ _sessionRefreshInterval: id }),
		_setOrphanCleanupInterval: (id) => set({ _orphanCleanupInterval: id }),
		_setEpicMonitorInterval: (id) => set({ _epicMonitorInterval: id }),

		// Refresh agents from backend
		refreshAgents: async (showLoading = false) => {
			const startState = get();

			if (showLoading && !startState.agentsLoading) {
				set({ agentsLoading: true });
			}

			try {
				const result = await commands.listAgentStatuses();
				const currentState = get();

				if (result.status === 'ok') {
					// Only update if data actually changed
					const dataChanged =
						JSON.stringify(currentState.agents) !==
						JSON.stringify(result.data);
					if (dataChanged) {
						set({ agents: result.data });
					}

					// Clear error only if there was one
					if (currentState.agentsError !== null) {
						set({ agentsError: null });
					}
				} else {
					// Only set error if it changed
					if (currentState.agentsError !== result.error) {
						set({ agentsError: result.error });
					}
				}
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : String(err);
				const currentState = get();
				if (currentState.agentsError !== errorMsg) {
					set({ agentsError: errorMsg });
				}
			} finally {
				if (showLoading) {
					const finalState = get();
					if (finalState.agentsLoading) {
						set({ agentsLoading: false });
					}
				}
			}
		},

		// Refresh tmux sessions from backend
		refreshSessions: async (showLoading = false) => {
			const startState = get();

			if (showLoading && !startState.sessionsLoading) {
				set({ sessionsLoading: true });
			}

			try {
				const running = await commands.isTmuxRunning();
				const currentState = get();

				// Only update if changed
				if (currentState.isTmuxRunning !== running) {
					set({ isTmuxRunning: running });
				}

				if (running) {
					const [sessionResult, recoveredResult] = await Promise.all([
						commands.listTmuxSessions(),
						commands.recoverTmuxSessions(),
					]);

					const afterFetchState = get();

					if (sessionResult.status === 'ok') {
						const sessionsChanged =
							JSON.stringify(afterFetchState.sessions) !==
							JSON.stringify(sessionResult.data);
						if (sessionsChanged) {
							set({ sessions: sessionResult.data });
						}
					}

					if (recoveredResult.status === 'ok') {
						const recoveredChanged =
							JSON.stringify(
								afterFetchState.recoveredSessions,
							) !== JSON.stringify(recoveredResult.data);
						if (recoveredChanged) {
							set({ recoveredSessions: recoveredResult.data });
						}
					}

					// Clear error if it was set
					const finalState = get();
					if (finalState.sessionsError !== null) {
						set({ sessionsError: null });
					}
				} else {
					// Only update if not already empty
					const emptyState = get();
					if (
						emptyState.sessions.length > 0 ||
						emptyState.recoveredSessions.length > 0
					) {
						set({ sessions: [], recoveredSessions: [] });
					}
				}
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : String(err);
				const errorState = get();
				if (errorState.sessionsError !== errorMsg) {
					set({ sessionsError: errorMsg });
				}
			} finally {
				if (showLoading) {
					const finalState = get();
					if (finalState.sessionsLoading) {
						set({ sessionsLoading: false });
					}
				}
			}
		},

		// Kill a tmux session
		killSession: async (sessionName: string) => {
			set({ killingSession: sessionName });
			try {
				await commands.killTmuxSession(sessionName);
				await get().refreshSessions(false);
			} catch (err) {
				set({
					sessionsError:
						err instanceof Error ? err.message : String(err),
				});
			} finally {
				set({ killingSession: null });
			}
		},

		// Cleanup an agent
		cleanupAgent: async (agent: AgentStatus, removeWorktree: boolean) => {
			if (!agent.worktree) {
				set({ agentsError: 'Agent has no associated worktree' });
				return;
			}

			set({ cleaningUpAgent: agent.session });
			try {
				const repoRootResult = await commands.getGitRepoRoot(
					agent.worktree,
				);
				if (repoRootResult.status === 'error') {
					set({ agentsError: repoRootResult.error });
					return;
				}

				const cleanupResult = await commands.cleanupAgent(
					agent.session,
					repoRootResult.data,
					removeWorktree,
					removeWorktree,
				);

				if (cleanupResult.status === 'error') {
					set({ agentsError: cleanupResult.error });
					return;
				}

				await get().refreshAgents(false);
			} catch (err) {
				set({
					agentsError:
						err instanceof Error ? err.message : String(err),
				});
			} finally {
				set({ cleaningUpAgent: null });
			}
		},

		// Complete agent work (create PR)
		completeAgentWork: async (agent: AgentStatus, prTitle: string) => {
			if (!agent.issue_ref) {
				set({ agentsError: 'Agent has no issue reference' });
				return;
			}

			set({ completingWork: agent.session });
			set({ agentsError: null });

			try {
				await commands.completeAgentWork(
					agent.session,
					prTitle,
					null,
					['agent-working'],
					['needs-review'],
					false,
				);
				await get().refreshAgents(false);
			} catch (err) {
				set({
					agentsError:
						err instanceof Error ? err.message : String(err),
				});
			} finally {
				set({ completingWork: null });
			}
		},

		// Load active Epic from persistent storage
		loadActiveEpic: async () => {
			set({ epicLoading: true, epicError: null });
			try {
				const epic = await commands.getActiveEpicState();
				set({ activeEpic: epic ?? null });
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : String(err);
				set({ epicError: errorMsg });
				console.error('Failed to load active Epic:', err);
			} finally {
				set({ epicLoading: false });
			}
		},

		// Set active Epic from EpicInfo (when linking a new Epic)
		setActiveEpic: async (epic: EpicInfo) => {
			set({ epicLoading: true, epicError: null });
			try {
				const activeEpic = await commands.setActiveEpicState(epic);
				set({ activeEpic });
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : String(err);
				set({ epicError: errorMsg });
				console.error('Failed to set active Epic:', err);
			} finally {
				set({ epicLoading: false });
			}
		},

		// Set active Epic from recovery info (when recovering an Epic)
		setActiveEpicFromRecovery: async (recovery: EpicRecoveryInfo) => {
			set({ epicLoading: true, epicError: null });
			try {
				const activeEpic =
					await commands.setActiveEpicFromRecovery(recovery);
				set({ activeEpic });
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : String(err);
				set({ epicError: errorMsg });
				console.error('Failed to set active Epic from recovery:', err);
			} finally {
				set({ epicLoading: false });
			}
		},

		// Sync active Epic state with GitHub (get latest sub-issue status)
		syncActiveEpic: async () => {
			const currentEpic = get().activeEpic;
			if (!currentEpic) return;

			set({ epicLoading: true, epicError: null });
			try {
				const result = await commands.syncActiveEpicState();
				if (result.status === 'ok' && result.data) {
					set({ activeEpic: result.data });
				} else if (result.status === 'error') {
					set({ epicError: result.error });
				}
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : String(err);
				set({ epicError: errorMsg });
				console.error('Failed to sync active Epic:', err);
			} finally {
				set({ epicLoading: false });
			}
		},

		// Clear active Epic (optionally archive it)
		clearActiveEpic: async (archive = false) => {
			set({ epicLoading: true, epicError: null });
			try {
				await commands.clearActiveEpicState(archive);
				set({ activeEpic: null });
				// Also stop monitoring when Epic is cleared
				get().stopEpicMonitoring();
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : String(err);
				set({ epicError: errorMsg });
				console.error('Failed to clear active Epic:', err);
			} finally {
				set({ epicLoading: false });
			}
		},

		// Mark a phase status (e.g., mark as completed for manual phases)
		markPhaseStatus: async (phaseNumber: number, status: string) => {
			const { activeEpic, syncActiveEpic } = get();
			if (!activeEpic) {
				console.error('No active Epic to mark phase status');
				return;
			}

			set({ epicLoading: true, epicError: null });
			try {
				const result = await commands.markEpicPhaseStatus(
					activeEpic.tracking_repo,
					activeEpic.epic_number,
					phaseNumber,
					status,
				);
				if (result.status === 'error') {
					set({ epicError: result.error });
					return;
				}
				// Sync to get the updated state
				await syncActiveEpic();
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : String(err);
				set({ epicError: errorMsg });
				console.error('Failed to mark phase status:', err);
			} finally {
				set({ epicLoading: false });
			}
		},

		// Start Epic monitoring (supervisor mode)
		startEpicMonitoring: () => {
			const { activeEpic, _epicMonitorInterval, checkEpicCompletions } =
				get();
			if (!activeEpic || _epicMonitorInterval !== null) return;

			// Initialize previous states from current sub-issues
			const previousStates = new Map<number, string>();
			for (const subIssue of activeEpic.sub_issues) {
				previousStates.set(subIssue.issue_number, subIssue.state);
			}

			set({
				_previousSubIssueStates: previousStates,
				epicMonitor: {
					...get().epicMonitor,
					isMonitoring: true,
					completedSinceStart: 0,
				},
			});

			// Do an immediate check
			checkEpicCompletions();

			// Start polling interval (30 seconds)
			const intervalId = window.setInterval(checkEpicCompletions, 30000);
			get()._setEpicMonitorInterval(intervalId);
		},

		// Stop Epic monitoring
		stopEpicMonitoring: () => {
			const { _epicMonitorInterval, _setEpicMonitorInterval } = get();

			if (_epicMonitorInterval !== null) {
				clearInterval(_epicMonitorInterval);
				_setEpicMonitorInterval(null);
			}

			set({
				epicMonitor: {
					...get().epicMonitor,
					isMonitoring: false,
				},
			});
		},

		// Check for Epic completions
		checkEpicCompletions: async () => {
			const {
				activeEpic,
				epicMonitor,
				_previousSubIssueStates,
				syncActiveEpic,
			} = get();
			if (!activeEpic) return;

			set({ epicMonitorChecking: true });
			try {
				// Check active sessions for PR creation (new feature)
				try {
					const prCheckResult = await commands.checkSessionsForPrs();
					if (prCheckResult.status === 'ok') {
						const prResults = prCheckResult.data;
						for (const result of prResults) {
							if (result.is_new && result.pr_url) {
								console.log(
									`[Epic Monitor] New PR detected for #${result.issue_number}: ${result.pr_url}`,
								);
								// The backend already updated the Epic state, just log for now
								// A future enhancement could show a toast notification here
							}
						}
					}
				} catch (err) {
					console.warn('PR check failed (non-critical):', err);
				}

				// Sync with GitHub to get latest status
				await syncActiveEpic();

				// Get the updated state
				const updatedEpic = get().activeEpic;
				if (!updatedEpic) return;

				// Auto-spawn merge workers for phases that are "Ready"
				// A phase is "Ready" when all open sub-issues have PRs
				const { _mergeWorkersSpawned } = get();

				if (epicMonitor.autoStartNextPhase) {
					const readyPhases = updatedEpic.phases.filter(
						(p) => p.status === 'ready',
					);

					for (const phase of readyPhases) {
						// Find all open sub-issues in this phase that have PRs but no merge worker yet
						const readySubIssues = updatedEpic.sub_issues.filter(
							(s) =>
								s.phase === phase.phase_number &&
								s.state.toLowerCase() === 'open' &&
								s.pr_url &&
								s.pr_number &&
								!s.has_agent_working && // No agent currently working on it
								!_mergeWorkersSpawned.has(s.issue_number), // Haven't already spawned a worker
						);

						for (const subIssue of readySubIssues) {
							console.log(
								`[Epic Monitor] Auto-spawning merge worker for PR #${subIssue.pr_number} (issue #${subIssue.issue_number})`,
							);

							try {
								const mergeResult = await commands.mergeReadyPr(
									subIssue.issue_number,
									'squash', // Default to squash merge
									true, // Delete branch after merge
								);

								if (
									mergeResult.status === 'ok' &&
									mergeResult.data.success
								) {
									console.log(
										`[Epic Monitor] Merge worker spawned: ${mergeResult.data.support_worker_session}`,
									);
									// Track that we've spawned a worker for this issue
									_mergeWorkersSpawned.add(
										subIssue.issue_number,
									);
								} else {
									console.error(
										`[Epic Monitor] Failed to spawn merge worker for #${subIssue.issue_number}:`,
										mergeResult.status === 'error'
											? mergeResult.error
											: mergeResult.data.error,
									);
								}
							} catch (err) {
								console.error(
									`[Epic Monitor] Error spawning merge worker:`,
									err,
								);
							}
						}
					}
				}

				// Clean up tracking for closed issues
				for (const subIssue of updatedEpic.sub_issues) {
					if (subIssue.state.toLowerCase() === 'closed') {
						_mergeWorkersSpawned.delete(subIssue.issue_number);
					}
				}

				// Check each sub-issue for state changes
				let newCompletions = 0;
				for (const subIssue of updatedEpic.sub_issues) {
					const previousState = _previousSubIssueStates.get(
						subIssue.issue_number,
					);

					// If state changed to closed, it's completed
					if (
						previousState &&
						previousState !== 'closed' &&
						subIssue.state === 'closed'
					) {
						newCompletions++;

						// Call the completion handler if auto-update is enabled
						if (epicMonitor.autoUpdateGithub) {
							try {
								await commands.onPipelineItemComplete(
									subIssue.issue_number,
									true,
								);
							} catch (err) {
								console.error(
									'Failed to handle completion:',
									err,
								);
							}
						}
					}

					// Update the reference
					_previousSubIssueStates.set(
						subIssue.issue_number,
						subIssue.state,
					);
				}

				if (newCompletions > 0) {
					set({
						epicMonitor: {
							...get().epicMonitor,
							completedSinceStart:
								get().epicMonitor.completedSinceStart +
								newCompletions,
						},
					});

					// Check if we should auto-start the next phase
					if (
						epicMonitor.autoStartNextPhase &&
						updatedEpic.local_repo_path
					) {
						// Check if any phase just completed
						const completedPhase = updatedEpic.phases.find(
							(p) =>
								p.status === 'completed' && p.total_count > 0,
						);

						// Find the next phase that's not started yet
						const nextPhase = updatedEpic.phases.find(
							(p) => p.status === 'not_started',
						);

						if (completedPhase && nextPhase) {
							console.log(
								`[Epic Monitor] Phase ${completedPhase.phase_number} completed, auto-starting phase ${nextPhase.phase_number}`,
							);

							// Start orchestration for the next phase
							try {
								const epicInfo = {
									epic_number: updatedEpic.epic_number,
									repo: updatedEpic.tracking_repo,
									work_repo: updatedEpic.work_repo,
									title: updatedEpic.title,
									url: updatedEpic.url,
									phases: updatedEpic.phases.map((p) => ({
										name: p.name,
										description: '',
										approach: 'agent-assisted',
										tasks: [],
										files: [],
										dependencies: [],
									})),
								};
								const startConfig = {
									phases: [nextPhase.phase_number],
									auto_spawn_agents: true,
									default_agent_type: 'claude',
									worktree_base: updatedEpic.local_repo_path,
								};
								const startResult =
									await commands.startEpicOrchestration(
										epicInfo,
										startConfig,
									);

								if (startResult.status === 'ok') {
									console.log(
										`[Epic Monitor] Auto-started phase ${nextPhase.phase_number}:`,
										startResult.data,
									);
								} else {
									console.error(
										`[Epic Monitor] Failed to auto-start phase ${nextPhase.phase_number}:`,
										startResult.error,
									);
								}
							} catch (err) {
								console.error(
									'[Epic Monitor] Auto-start error:',
									err,
								);
							}
						}
					}
				}

				set({
					epicMonitor: {
						...get().epicMonitor,
						lastCheck: new Date(),
					},
				});
			} catch (err) {
				console.error('Monitor check failed:', err);
			} finally {
				set({ epicMonitorChecking: false });
			}
		},

		// Toggle auto-update GitHub setting
		setEpicMonitorAutoUpdate: (enabled: boolean) => {
			set({
				epicMonitor: {
					...get().epicMonitor,
					autoUpdateGithub: enabled,
				},
			});
		},

		// Toggle auto-start next phase setting
		setEpicMonitorAutoStartNextPhase: (enabled: boolean) => {
			set({
				epicMonitor: {
					...get().epicMonitor,
					autoStartNextPhase: enabled,
				},
			});
		},

		// Increment completed count (for external use)
		incrementCompletedCount: (count = 1) => {
			set({
				epicMonitor: {
					...get().epicMonitor,
					completedSinceStart:
						get().epicMonitor.completedSinceStart + count,
				},
			});
		},

		// Initialize store and start polling
		initialize: async () => {
			const {
				refreshAgents,
				refreshSessions,
				loadActiveEpic,
				syncActiveEpic,
				incrementCompletedCount,
				_setAgentRefreshInterval,
				_setSessionRefreshInterval,
				_setOrphanCleanupInterval,
			} = get();

			// Load current machine ID
			try {
				const machineId = await commands.getCurrentMachineId();
				set({ currentMachineId: machineId });
			} catch (err) {
				console.error('Failed to get machine ID:', err);
			}

			// Initial load with loading state (including persisted Epic state)
			await Promise.all([
				refreshAgents(true),
				refreshSessions(true),
				loadActiveEpic(),
			]);

			// Set up event listener for real-time PR detection
			const prUnlisten = await listen<AgentPrCreatedEvent>(
				'agent-pr-created',
				(event) => {
					const { issue_number, pr_url, session } = event.payload;
					console.log(
						`[DevOps] PR created for #${issue_number}: ${pr_url} (session: ${session})`,
					);

					// Sync Epic state to get updated PR info
					syncActiveEpic();

					// Increment completion counter
					incrementCompletedCount(1);
				},
			);
			set({ _prEventUnlisten: prUnlisten });

			// Set up event listener for orphan container cleanup (for toast notifications)
			const orphanUnlisten = await listen<OrphanContainerCleanedEvent>(
				'orphan-container-cleaned',
				(event) => {
					const { container_name, issue_number } = event.payload;
					const issueText = issue_number
						? `#${issue_number}`
						: container_name;
					console.log(
						`[DevOps] Cleaned up orphan container: ${container_name} (issue: ${issueText})`,
					);

					// Show toast notification
					toast.info(
						'Orphan Container Cleaned',
						`Removed container for ${issueText}`,
					);
				},
			);
			set({ _orphanEventUnlisten: orphanUnlisten });

			// Set up polling intervals
			// Agents: 12 seconds (staggered from sessions)
			const agentInterval = window.setInterval(
				() => refreshAgents(false),
				12000,
			);
			_setAgentRefreshInterval(agentInterval);

			// Sessions: 10 seconds
			const sessionInterval = window.setInterval(
				() => refreshSessions(false),
				10000,
			);
			_setSessionRefreshInterval(sessionInterval);

			// Orphan container cleanup: 60 seconds
			// This runs periodically to clean up Docker containers that were left behind
			const orphanCleanupInterval = window.setInterval(async () => {
				try {
					await commands.cleanupOrphanedContainers();
					// Toasts are shown via the orphan-container-cleaned event listener
				} catch (err) {
					// Silent failure - orphan cleanup is non-critical
					console.debug(
						'Orphan cleanup check failed (non-critical):',
						err,
					);
				}
			}, 60000);
			_setOrphanCleanupInterval(orphanCleanupInterval);

			// Run initial orphan cleanup
			commands.cleanupOrphanedContainers().catch((err) => {
				console.debug(
					'Initial orphan cleanup failed (non-critical):',
					err,
				);
			});
		},

		// Cleanup intervals and event listeners
		cleanup: () => {
			const {
				_agentRefreshInterval,
				_sessionRefreshInterval,
				_epicMonitorInterval,
				_orphanCleanupInterval,
				_prEventUnlisten,
				_orphanEventUnlisten,
			} = get();

			if (_agentRefreshInterval !== null) {
				clearInterval(_agentRefreshInterval);
				set({ _agentRefreshInterval: null });
			}

			if (_sessionRefreshInterval !== null) {
				clearInterval(_sessionRefreshInterval);
				set({ _sessionRefreshInterval: null });
			}

			if (_epicMonitorInterval !== null) {
				clearInterval(_epicMonitorInterval);
				set({ _epicMonitorInterval: null });
			}

			if (_orphanCleanupInterval !== null) {
				clearInterval(_orphanCleanupInterval);
				set({ _orphanCleanupInterval: null });
			}

			if (_prEventUnlisten !== null) {
				_prEventUnlisten();
				set({ _prEventUnlisten: null });
			}

			if (_orphanEventUnlisten !== null) {
				_orphanEventUnlisten();
				set({ _orphanEventUnlisten: null });
			}
		},
	})),
);

// Hook for initializing the store (call once when DevOps settings are mounted)
export const initializeDevOpsStore = () => {
	const { initialize } = useDevOpsStore.getState();
	initialize();
};

// Hook for cleanup (call when DevOps settings are unmounted)
export const cleanupDevOpsStore = () => {
	const { cleanup } = useDevOpsStore.getState();
	cleanup();
};
