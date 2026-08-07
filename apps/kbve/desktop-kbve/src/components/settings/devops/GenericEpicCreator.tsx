import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
	EpicConfig,
	EpicInfo,
	EpicRecoveryInfo,
	PhaseConfig,
	StartOrchestrationConfig,
	OrchestrationResult,
	AssignIssueConfig,
	AssignIssueResult,
} from '../../../bindings';
import { toast } from '../../../stores/toastStore';
import { useDevOpsStore } from '../../../stores/devopsStore';

interface PlanTemplate {
	id: string;
	title: string;
	description: string;
	labels: string[];
	tracking_repo: string | null;
	working_repo: string | null;
	goal: string;
	success_metrics: string[];
	phases: PhaseConfig[];
}

interface EpicPlan {
	title: string;
	goal: string;
	successMetrics: string[];
	phases: PhaseConfig[];
	labels: string[];
}

// Predefined epic templates
const EPIC_TEMPLATES: Record<string, EpicPlan> = {
	blank: {
		title: '',
		goal: '',
		successMetrics: [],
		phases: [],
		labels: [],
	},
	'cicd-testing': {
		title: 'CICD Testing Infrastructure',
		goal: 'Build comprehensive testing and CI/CD infrastructure for the multi-agent DevOps system to ensure production readiness and prevent future breakage.',
		successMetrics: [
			'100+ total tests',
			'>70% code coverage',
			'CI/CD running on all PRs',
			'Pre-commit hooks active',
			'All phases complete',
		],
		phases: [
			{
				name: 'Foundation',
				description:
					'Build test utilities and infrastructure (test mocks, fixtures, helpers)',
				approach: 'manual',
			},
			{
				name: 'Integration Tests',
				description:
					'Comprehensive integration tests for agent workflows (spawning, cleanup, PR creation, session recovery)',
				approach: 'agent-assisted',
			},
			{
				name: 'CI/CD Integration',
				description:
					'GitHub Actions workflow, pre-commit hooks, coverage tracking',
				approach: 'agent-assisted',
			},
			{
				name: 'Advanced Scenarios',
				description:
					'Multi-machine coordination, error handling, resource limits',
				approach: 'agent-assisted',
			},
		],
		labels: ['cicd', 'testing', 'high-priority'],
	},
};

type Step = 'template' | 'edit' | 'review' | 'link';
type CreateMode = 'new' | 'link';

export function GenericEpicCreator() {
	// Get persisted Epic state from store
	const {
		activeEpic,
		epicLoading,
		setActiveEpicFromRecovery,
		syncActiveEpic,
		clearActiveEpic,
	} = useDevOpsStore();

	const [currentStep, setCurrentStep] = useState<Step>('template');
	const [createMode, setCreateMode] = useState<CreateMode>('new');
	const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
	const [repo, setRepo] = useState<string>('KBVE/Handy');
	const [workRepo, setWorkRepo] = useState<string>('');

	// Link existing epic state
	const [linkEpicNumber, setLinkEpicNumber] = useState<string>('');
	const [linkRepo, setLinkRepo] = useState<string>('KBVE/Handy');
	const [linking, setLinking] = useState(false);
	const [recoveryInfo, setRecoveryInfo] = useState<EpicRecoveryInfo | null>(
		null,
	);

	// Loaded templates from filesystem
	const [templates, setTemplates] = useState<PlanTemplate[]>([
		{
			id: 'blank',
			title: 'Blank',
			description: 'Start from scratch',
			labels: [],
			tracking_repo: null,
			working_repo: null,
			goal: '',
			success_metrics: [],
			phases: [],
		},
	]);
	const [templatesLoading, setTemplatesLoading] = useState(true);
	const [templatesError, setTemplatesError] = useState<string | null>(null);

	// Editable plan state
	const [title, setTitle] = useState<string>('');
	const [goal, setGoal] = useState<string>('');
	const [successMetrics, setSuccessMetrics] = useState<string[]>([]);
	const [phases, setPhases] = useState<PhaseConfig[]>([]);
	const [labels, setLabels] = useState<string[]>([]);

	const [creating, setCreating] = useState(false);
	const [result, setResult] = useState<EpicInfo | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Orchestration state
	const [orchestrating, setOrchestrating] = useState(false);
	const [orchestrationResult, setOrchestrationResult] =
		useState<OrchestrationResult | null>(null);
	const [autoSpawnAgents, setAutoSpawnAgents] = useState(false);
	// Initialize from persisted state if available
	const [localRepoPath, setLocalRepoPath] = useState<string>(
		activeEpic?.local_repo_path || '',
	);
	const [repoPathSuggestions, setRepoPathSuggestions] = useState<string[]>(
		[],
	);
	const [spawningIssue, setSpawningIssue] = useState<number | null>(null);

	// Save local repo path when it changes
	const handleLocalRepoPathChange = async (path: string) => {
		setLocalRepoPath(path);
		if (path && activeEpic) {
			try {
				await invoke('set_epic_local_repo_path', {
					localRepoPath: path,
				});
			} catch (err) {
				console.error('Failed to save local repo path:', err);
			}
		}
	};

	// New metric/label/phase inputs
	const [newMetric, setNewMetric] = useState<string>('');
	const [newLabel, setNewLabel] = useState<string>('');

	// Sync local repo path when activeEpic changes (e.g., after loading)
	useEffect(() => {
		const path = activeEpic?.local_repo_path;
		if (path) {
			void Promise.resolve().then(() =>
				setLocalRepoPath((prev) => prev || path),
			);
		}
	}, [activeEpic?.local_repo_path]);

	// Load templates on mount
	useEffect(() => {
		const loadTemplates = async () => {
			try {
				setTemplatesLoading(true);
				const loadedTemplates = await invoke<PlanTemplate[]>(
					'list_epic_plan_templates',
				);
				setTemplates(loadedTemplates);
				setTemplatesError(null);

				// Apply repos from first template if it has them (templates are sorted by title)
				if (loadedTemplates.length > 0) {
					const firstTemplate = loadedTemplates[0];
					setSelectedTemplate(firstTemplate.id);
					if (firstTemplate.tracking_repo) {
						setRepo(firstTemplate.tracking_repo);
					}
					if (firstTemplate.working_repo) {
						setWorkRepo(firstTemplate.working_repo);
					}
				}
			} catch (err) {
				console.error('Failed to load templates:', err);
				setTemplatesError(err as string);
				toast.warning(
					'Template Loading Failed',
					'Using fallback templates. Could not load from docs/plans/',
					7000,
				);
				// Fallback to hardcoded templates if filesystem loading fails
				const fallbackTemplates: PlanTemplate[] = [
					{
						id: 'blank',
						title: 'Blank',
						description: 'Start from scratch',
						labels: [],
						tracking_repo: null,
						working_repo: null,
						goal: '',
						success_metrics: [],
						phases: [],
					},
					{
						id: 'cicd-testing',
						title: EPIC_TEMPLATES['cicd-testing'].title,
						description: 'Comprehensive testing infrastructure',
						labels: EPIC_TEMPLATES['cicd-testing'].labels,
						tracking_repo: null,
						working_repo: null,
						goal: EPIC_TEMPLATES['cicd-testing'].goal,
						success_metrics:
							EPIC_TEMPLATES['cicd-testing'].successMetrics,
						phases: EPIC_TEMPLATES['cicd-testing'].phases,
					},
				];
				setTemplates(fallbackTemplates);
			} finally {
				setTemplatesLoading(false);
			}
		};
		loadTemplates();
	}, []);

	// Restore Epic state from persisted store on mount
	useEffect(() => {
		if (!(activeEpic && !result)) return;
		void Promise.resolve().then(() => {
			// We have a persisted Epic but no local result yet - restore state
			// Convert ActiveEpicState back to EpicInfo for the UI
			const restoredEpic: EpicInfo = {
				epic_number: activeEpic.epic_number,
				repo: activeEpic.tracking_repo,
				work_repo: activeEpic.work_repo,
				title: activeEpic.title,
				url: activeEpic.url,
				phases: activeEpic.phases.map((p) => ({
					name: p.name,
					description: '', // Not stored in ActiveEpicState
					approach: 'agent-assisted',
				})),
			};
			setResult(restoredEpic);
			setLinkRepo(activeEpic.tracking_repo);
			setLinkEpicNumber(activeEpic.epic_number.toString());
			setCreateMode('link');
			setCurrentStep('link');

			// Also build recovery info if we have sub-issues
			if (activeEpic.sub_issues.length > 0) {
				const subIssues = activeEpic.sub_issues.map((s) => ({
					issue_number: s.issue_number,
					title: s.title,
					phase: s.phase ?? null,
					state: s.state,
					labels: [], // Not stored in TrackedSubIssue
					has_agent_working: s.has_agent_working,
					url: s.url,
					pr_url: s.pr_url ?? null,
					pr_number: s.pr_number ?? null,
				}));

				const completed = subIssues.filter(
					(s) => s.state === 'closed',
				).length;
				const readyForAgents = subIssues.filter(
					(s) => s.state === 'open' && !s.has_agent_working,
				);
				const inProgress = subIssues.filter((s) => s.has_agent_working);

				// Calculate phases without issues
				const phasesWithIssues = new Set(
					subIssues
						.map((s) => s.phase)
						.filter((p): p is number => p !== null),
				);
				const allPhaseNumbers = activeEpic.phases.map(
					(p) => p.phase_number,
				);
				const phasesWithoutIssues = allPhaseNumbers.filter(
					(pn) => !phasesWithIssues.has(pn),
				);

				const restoredRecovery: EpicRecoveryInfo = {
					epic: restoredEpic,
					epic_body: '', // Not needed for display - only used when loading from GitHub
					sub_issues: subIssues,
					progress: {
						total: subIssues.length,
						completed,
						percentage:
							subIssues.length > 0
								? Math.round(
										(completed / subIssues.length) * 100,
									)
								: 0,
						remaining: subIssues.length - completed,
					},
					phases_without_issues: phasesWithoutIssues,
					ready_for_agents: readyForAgents,
					in_progress: inProgress,
				};
				setRecoveryInfo(restoredRecovery);
			}

			toast.info(
				'Epic Restored',
				`Restored active Epic #${activeEpic.epic_number}: ${activeEpic.title}`,
				5000,
			);
		});
	}, [activeEpic, result]);

	const loadTemplate = (templateId: string) => {
		const template = templates.find((t) => t.id === templateId);
		if (!template) return;

		setTitle(template.title);
		setGoal(template.goal);
		setSuccessMetrics([...template.success_metrics]);
		setPhases([...template.phases]);
		setLabels([...template.labels]);
		setSelectedTemplate(templateId);

		// Set repos from template if specified
		if (template.tracking_repo) {
			setRepo(template.tracking_repo);
		}
		if (template.working_repo) {
			setWorkRepo(template.working_repo);
		}
	};

	// Update repos when template selection changes in the dropdown
	const handleTemplateChange = (templateId: string) => {
		setSelectedTemplate(templateId);
		const template = templates.find((t) => t.id === templateId);
		if (template) {
			// Update repo fields immediately when template changes
			if (template.tracking_repo) {
				setRepo(template.tracking_repo);
			}
			if (template.working_repo) {
				setWorkRepo(template.working_repo);
			}
		}
	};

	const handleTemplateSelect = () => {
		loadTemplate(selectedTemplate);
		setCurrentStep('edit');
	};

	const addSuccessMetric = () => {
		if (newMetric.trim()) {
			setSuccessMetrics([...successMetrics, newMetric.trim()]);
			setNewMetric('');
		}
	};

	const removeSuccessMetric = (index: number) => {
		setSuccessMetrics(successMetrics.filter((_, i) => i !== index));
	};

	const addLabel = () => {
		if (newLabel.trim() && !labels.includes(newLabel.trim())) {
			setLabels([...labels, newLabel.trim()]);
			setNewLabel('');
		}
	};

	const removeLabel = (index: number) => {
		setLabels(labels.filter((_, i) => i !== index));
	};

	const addPhase = () => {
		setPhases([
			...phases,
			{
				name: '',
				description: '',
				approach: 'manual',
			},
		]);
	};

	const updatePhase = (
		index: number,
		field: keyof PhaseConfig,
		value: string,
	) => {
		const updated = [...phases];
		updated[index] = { ...updated[index], [field]: value };
		setPhases(updated);
	};

	const removePhase = (index: number) => {
		setPhases(phases.filter((_, i) => i !== index));
	};

	const movePhaseUp = (index: number) => {
		if (index > 0) {
			const updated = [...phases];
			[updated[index - 1], updated[index]] = [
				updated[index],
				updated[index - 1],
			];
			setPhases(updated);
		}
	};

	const movePhaseDown = (index: number) => {
		if (index < phases.length - 1) {
			const updated = [...phases];
			[updated[index], updated[index + 1]] = [
				updated[index + 1],
				updated[index],
			];
			setPhases(updated);
		}
	};

	const handleCreateEpic = async () => {
		setCreating(true);
		setError(null);
		setResult(null);

		try {
			const config: EpicConfig = {
				title,
				repo,
				work_repo: workRepo.trim() || null,
				goal,
				success_metrics: successMetrics,
				phases,
				labels,
			};

			const epicInfo = await invoke<EpicInfo>('create_epic', { config });
			setResult(epicInfo);
			console.log('Epic created:', epicInfo);
			toast.success(
				'Epic Created Successfully',
				`Epic #${epicInfo.epic_number} created in ${epicInfo.repo}`,
				8000,
			);
		} catch (err) {
			setError(err as string);
			console.error('Failed to create epic:', err);
			toast.error('Failed to Create Epic', err as string, 10000);
		} finally {
			setCreating(false);
		}
	};

	const handleLinkEpic = async () => {
		const epicNum = parseInt(linkEpicNumber, 10);
		if (isNaN(epicNum) || epicNum <= 0) {
			toast.error(
				'Invalid Epic Number',
				'Please enter a valid issue number',
			);
			return;
		}

		setLinking(true);
		setError(null);

		try {
			// First try to load with full recovery info
			const recovery = await invoke<EpicRecoveryInfo>(
				'load_epic_for_recovery',
				{
					repo: linkRepo,
					epicNumber: epicNum,
				},
			);

			// Persist the Epic state to the store (survives tab switches and app restarts)
			await setActiveEpicFromRecovery(recovery);

			setRecoveryInfo(recovery);
			setResult(recovery.epic);

			toast.success(
				'Epic Linked & Saved',
				`Epic #${recovery.epic.epic_number} is now your active Epic. State will persist across sessions.`,
				8000,
			);
		} catch (err) {
			setError(err as string);
			toast.error('Failed to Link Epic', err as string, 10000);
		} finally {
			setLinking(false);
		}
	};

	const resetForm = (clearPersistedEpic = false) => {
		setCurrentStep('template');
		setCreateMode('new');
		setSelectedTemplate('blank');
		setTitle('');
		setGoal('');
		setSuccessMetrics([]);
		setPhases([]);
		setLabels([]);
		setResult(null);
		setError(null);
		setOrchestrationResult(null);
		setAutoSpawnAgents(false);
		setLinkEpicNumber('');
		setRecoveryInfo(null);

		// Optionally clear the persisted Epic state
		if (clearPersistedEpic) {
			clearActiveEpic(true); // Archive it for history
			toast.info('Epic Unlinked', 'The active Epic has been archived');
		}
	};

	// Sync Epic with GitHub to get latest status
	const handleSyncEpic = async () => {
		if (!activeEpic) return;
		try {
			await syncActiveEpic();
			toast.success(
				'Epic Synced',
				'Updated sub-issue status from GitHub',
			);
		} catch (err) {
			toast.error('Sync Failed', err as string);
		}
	};

	// Update Epic issue on GitHub with phase status
	const handleUpdateEpicOnGithub = async () => {
		if (!activeEpic) return;

		try {
			// First get phase statuses
			const phaseStatuses = await invoke('get_epic_phase_status', {
				epicNumber: activeEpic.epic_number,
				epicRepo: activeEpic.tracking_repo,
				phases: activeEpic.phases.map((p) => ({
					name: p.name,
					description: '',
					approach:
						p.status === 'completed' ? 'manual' : 'agent-assisted',
					tasks: [],
					files: [],
					dependencies: [],
				})),
			});

			// Then update the Epic issue body
			await invoke('update_epic_phase_status_on_github', {
				epicRepo: activeEpic.tracking_repo,
				epicNumber: activeEpic.epic_number,
				phaseStatuses,
			});

			toast.success(
				'Epic Updated',
				'Updated Epic issue on GitHub with current phase status',
				6000,
			);
		} catch (err) {
			console.error('Failed to update Epic on GitHub:', err);
			toast.error('Update Failed', err as string, 10000);
		}
	};

	// Spawn an agent for a specific issue
	const handleSpawnAgentForIssue = async (
		issueNumber: number,
		issueTitle: string,
	) => {
		if (!activeEpic || !localRepoPath) {
			toast.error(
				'Cannot Spawn Agent',
				'Please set the local repository path first',
			);
			return;
		}

		setSpawningIssue(issueNumber);
		try {
			const config: AssignIssueConfig = {
				tracking_repo: activeEpic.tracking_repo,
				work_repo: activeEpic.work_repo,
				issue_number: issueNumber,
				agent_type: 'claude',
				repo_path: localRepoPath,
				start_labels: ['staging'],
				remove_labels: ['agent-todo'],
			};

			const result = await invoke<AssignIssueResult>(
				'assign_issue_to_agent_pipeline',
				{ config },
			);

			// Update the Epic state to reflect the agent assignment
			await invoke('update_epic_sub_issue_agent', {
				issueNumber,
				sessionName: result.spawn_result.session_name,
				agentType: 'claude',
			});

			// Refresh the Epic state
			await syncActiveEpic();

			toast.success(
				'Agent Spawned',
				`Agent working on #${issueNumber}: ${issueTitle.substring(0, 30)}...`,
				8000,
			);
		} catch (err) {
			console.error('Failed to spawn agent:', err);
			toast.error('Failed to Spawn Agent', err as string, 10000);
		} finally {
			setSpawningIssue(null);
		}
	};

	// Start orchestration - create sub-issues and spawn agents
	const handleStartOrchestration = async (phasesToStart: number[] = [1]) => {
		if (!result) return;

		setOrchestrating(true);
		try {
			const config: StartOrchestrationConfig = {
				phases: phasesToStart,
				auto_spawn_agents: autoSpawnAgents,
				default_agent_type: 'claude',
				worktree_base: localRepoPath,
			};

			const orchResult = await invoke<OrchestrationResult>(
				'start_epic_orchestration',
				{
					epic: result,
					config,
				},
			);

			setOrchestrationResult(orchResult);

			if (orchResult.sub_issues.length > 0) {
				toast.success(
					'Orchestration Started',
					`Created ${orchResult.sub_issues.length} sub-issues${orchResult.spawned_agents.length > 0 ? ` and spawned ${orchResult.spawned_agents.length} agents` : ''}`,
					8000,
				);
			}

			if (orchResult.warnings.length > 0) {
				orchResult.warnings.forEach((warning) => {
					toast.warning('Orchestration Warning', warning, 6000);
				});
			}
		} catch (err) {
			console.error('Failed to start orchestration:', err);
			toast.error('Orchestration Failed', err as string, 10000);
		} finally {
			setOrchestrating(false);
		}
	};

	// Success State - render first so we can return early
	if (result) {
		const isLinkedEpic = recoveryInfo !== null;
		return (
			<div className="p-4 bg-green-500/10 border border-green-500/20 rounded space-y-3">
				<div className="flex items-center gap-2">
					<span className="text-green-400 text-lg">✓</span>
					<span className="text-sm font-medium text-white">
						{isLinkedEpic
							? 'Epic Linked Successfully!'
							: 'Epic Created Successfully!'}
					</span>
				</div>
				<div className="space-y-1 text-xs text-gray-300">
					<div>
						<span className="text-gray-400">Epic Number:</span>{' '}
						<span className="font-mono text-white">
							#{result.epic_number}
						</span>
					</div>
					<div>
						<span className="text-gray-400">Repository:</span>{' '}
						<span className="font-mono text-white">
							{result.repo}
						</span>
					</div>
					<div>
						<span className="text-gray-400">Work Repository:</span>{' '}
						<span className="font-mono text-white">
							{result.work_repo}
						</span>
					</div>
					<div>
						<span className="text-gray-400">Phases:</span>{' '}
						<span className="text-white">
							{result.phases.length}
						</span>
					</div>
					<div>
						<a
							href={result.url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline">
							View on GitHub →
						</a>
					</div>
				</div>

				{/* Recovery Info for Linked Epics */}
				{/* Phase Status from persisted state */}
				{activeEpic && activeEpic.phases.length > 0 && (
					<div className="mt-3 pt-3 border-t border-green-500/20">
						<div className="text-xs text-green-400 font-medium mb-2">
							Phase Progress:
						</div>
						<div className="space-y-2">
							{activeEpic.phases.map((phase) => {
								const statusColors: Record<string, string> = {
									completed: 'text-green-400 bg-green-500/20',
									ready: 'text-yellow-400 bg-yellow-500/20',
									in_progress: 'text-blue-400 bg-blue-500/20',
									not_started: 'text-gray-400 bg-gray-500/20',
									skipped: 'text-gray-500 bg-gray-500/10',
								};
								const statusLabels: Record<string, string> = {
									completed: '✓ Complete',
									ready: '🟡 Ready',
									in_progress: '▶ In Progress',
									not_started: '○ Not Started',
									skipped: '⊘ Skipped',
								};
								const colorClass =
									statusColors[phase.status] ||
									statusColors.not_started;
								const label =
									statusLabels[phase.status] ||
									statusLabels.not_started;

								return (
									<div
										key={phase.phase_number}
										className="flex items-center gap-2 text-xs">
										<span
											className={`px-2 py-0.5 rounded ${colorClass}`}>
											Phase {phase.phase_number}
										</span>
										<span className="text-white">
											{phase.name}
										</span>
										<span className="text-gray-500">—</span>
										<span
											className={
												colorClass.split(' ')[0]
											}>
											{label}
										</span>
										{phase.total_count > 0 && (
											<span className="text-gray-400">
												({phase.completed_count}/
												{phase.total_count} issues)
											</span>
										)}
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* Local Repo Path - needed for agent spawning */}
				{recoveryInfo && recoveryInfo.ready_for_agents.length > 0 && (
					<div className="mt-3 pt-3 border-t border-green-500/20">
						<div className="text-xs text-green-400 font-medium mb-2">
							Local Repository (for worktrees):
						</div>
						<div className="flex gap-2">
							<input
								type="text"
								value={localRepoPath}
								onChange={(e) =>
									handleLocalRepoPathChange(e.target.value)
								}
								placeholder="/Users/me/projects/MyRepo"
								className="flex-1 px-2 py-1.5 bg-mid-gray/20 border border-mid-gray/30 rounded text-xs text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
							/>
							<button
								type="button"
								onClick={async () => {
									try {
										const suggestions = await invoke<
											string[]
										>('suggest_local_repo_path', {
											githubRepo:
												result?.work_repo ||
												activeEpic?.work_repo ||
												'',
										});
										setRepoPathSuggestions(suggestions);
										if (
											suggestions.length > 0 &&
											!localRepoPath
										) {
											handleLocalRepoPathChange(
												suggestions[0],
											);
										}
									} catch (err) {
										console.error(
											'Failed to suggest repo path:',
											err,
										);
									}
								}}
								className="px-2 py-1.5 bg-mid-gray/30 hover:bg-mid-gray/40 text-gray-300 text-xs rounded transition-colors">
								Detect
							</button>
						</div>
						{repoPathSuggestions.length > 1 && (
							<div className="mt-1 flex flex-wrap gap-1">
								{repoPathSuggestions.map((path, idx) => (
									<button
										key={idx}
										type="button"
										onClick={() =>
											handleLocalRepoPathChange(path)
										}
										className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
											localRepoPath === path
												? 'bg-blue-500/30 text-blue-300'
												: 'bg-mid-gray/20 text-gray-400 hover:bg-mid-gray/30'
										}`}>
										{path.split('/').slice(-2).join('/')}
									</button>
								))}
							</div>
						)}
						{!localRepoPath && (
							<p className="text-[10px] text-yellow-400/70 mt-1">
								⚠ Set repo path to enable agent spawning
							</p>
						)}
					</div>
				)}

				{recoveryInfo && (
					<div className="mt-3 pt-3 border-t border-green-500/20">
						<div className="text-xs text-green-400 font-medium mb-2">
							Epic Status:
						</div>
						<div className="space-y-2 text-xs text-gray-300">
							<div className="flex gap-4">
								<div>
									Progress:{' '}
									<span className="text-white font-medium">
										{recoveryInfo.progress.completed}/
										{recoveryInfo.progress.total}
									</span>
									{recoveryInfo.progress.total > 0 && (
										<span className="text-gray-400 ml-1">
											({recoveryInfo.progress.percentage}
											%)
										</span>
									)}
								</div>
								<div>
									Remaining:{' '}
									<span className="text-white">
										{recoveryInfo.progress.remaining}
									</span>
								</div>
							</div>

							{recoveryInfo.in_progress.length > 0 && (
								<div>
									<span className="text-yellow-400">
										In Progress (
										{recoveryInfo.in_progress.length}):
									</span>
									<ul className="mt-1 ml-4 list-disc space-y-0.5">
										{recoveryInfo.in_progress.map(
											(issue) => (
												<li key={issue.issue_number}>
													<a
														href={issue.url}
														target="_blank"
														rel="noopener noreferrer"
														className="text-blue-400 hover:text-blue-300">
														#{issue.issue_number}
													</a>{' '}
													-{' '}
													{issue.title.substring(
														0,
														40,
													)}
													...
												</li>
											),
										)}
									</ul>
								</div>
							)}

							{recoveryInfo.ready_for_agents.length > 0 && (
								<div>
									<span className="text-green-400">
										Ready for Agents (
										{recoveryInfo.ready_for_agents.length}):
									</span>
									<ul className="mt-1 ml-4 space-y-1">
										{recoveryInfo.ready_for_agents
											.slice(0, 5)
											.map((issue) => (
												<li
													key={issue.issue_number}
													className="flex items-center gap-2">
													<a
														href={issue.url}
														target="_blank"
														rel="noopener noreferrer"
														className="text-blue-400 hover:text-blue-300">
														#{issue.issue_number}
													</a>
													<span className="text-gray-400">
														-
													</span>
													<span
														className="text-gray-300 flex-1 truncate"
														title={issue.title}>
														{issue.title.substring(
															0,
															35,
														)}
														...
													</span>
													<button
														onClick={() =>
															handleSpawnAgentForIssue(
																issue.issue_number,
																issue.title,
															)
														}
														disabled={
															spawningIssue ===
																issue.issue_number ||
															!localRepoPath
														}
														className="px-2 py-0.5 text-[10px] bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
														title={
															localRepoPath
																? 'Spawn Claude agent for this issue'
																: 'Set local repo path first'
														}>
														{spawningIssue ===
														issue.issue_number
															? 'Spawning...'
															: 'Spawn'}
													</button>
												</li>
											))}
										{recoveryInfo.ready_for_agents.length >
											5 && (
											<li className="text-gray-500">
												...and{' '}
												{recoveryInfo.ready_for_agents
													.length - 5}{' '}
												more
											</li>
										)}
									</ul>
								</div>
							)}

							{recoveryInfo.phases_without_issues.length > 0 && (
								<div className="text-yellow-400">
									Phases without sub-issues:{' '}
									{recoveryInfo.phases_without_issues.join(
										', ',
									)}
								</div>
							)}
						</div>
					</div>
				)}

				{/* Orchestration Result */}
				{orchestrationResult && (
					<div className="mt-3 pt-3 border-t border-green-500/20">
						<div className="text-xs text-green-400 font-medium mb-2">
							Orchestration Results:
						</div>
						<div className="space-y-1 text-xs text-gray-300">
							<div>
								Sub-issues created:{' '}
								<span className="text-white">
									{orchestrationResult.sub_issues.length}
								</span>
							</div>
							{orchestrationResult.spawned_agents.length > 0 && (
								<div>
									Agents spawned:{' '}
									<span className="text-white">
										{
											orchestrationResult.spawned_agents
												.length
										}
									</span>
								</div>
							)}
							{orchestrationResult.sub_issues.length > 0 && (
								<div className="mt-2">
									<span className="text-gray-400">
										Created issues:
									</span>
									<ul className="mt-1 ml-4 list-disc space-y-0.5">
										{orchestrationResult.sub_issues
											.slice(0, 5)
											.map((issue) => (
												<li key={issue.issue_number}>
													<a
														href={issue.url}
														target="_blank"
														rel="noopener noreferrer"
														className="text-blue-400 hover:text-blue-300">
														#{issue.issue_number}
													</a>{' '}
													-{' '}
													{issue.title.substring(
														0,
														40,
													)}
													...
												</li>
											))}
										{orchestrationResult.sub_issues.length >
											5 && (
											<li className="text-gray-500">
												...and{' '}
												{orchestrationResult.sub_issues
													.length - 5}{' '}
												more
											</li>
										)}
									</ul>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Start Orchestration Section */}
				{!orchestrationResult && (
					<div className="mt-3 pt-3 border-t border-green-500/20">
						<div className="text-xs text-gray-400 mb-2">
							<strong>Start Orchestration:</strong>
							<p className="mt-1">
								This will create sub-issues from phase tasks and
								optionally spawn agents.
							</p>
						</div>

						{/* Options */}
						<div className="space-y-2 mb-3">
							<label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
								<input
									type="checkbox"
									checked={autoSpawnAgents}
									onChange={(e) =>
										setAutoSpawnAgents(e.target.checked)
									}
									className="rounded border-mid-gray/30 bg-mid-gray/10 text-blue-500 focus:ring-blue-500"
								/>
								Auto-spawn agents for agent-assisted tasks
							</label>

							{autoSpawnAgents && (
								<div className="ml-6">
									<label className="block text-xs text-gray-400 mb-1">
										Local Git Repository Path (for
										worktrees)
									</label>
									<div className="flex gap-2">
										<input
											type="text"
											value={localRepoPath}
											onChange={(e) =>
												handleLocalRepoPathChange(
													e.target.value,
												)
											}
											placeholder="/Users/me/projects/MyRepo"
											className="flex-1 px-2 py-1.5 bg-mid-gray/20 border border-mid-gray/30 rounded text-xs text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
										/>
										<button
											type="button"
											onClick={async () => {
												try {
													const suggestions =
														await invoke<string[]>(
															'suggest_local_repo_path',
															{
																githubRepo:
																	result?.work_repo ||
																	workRepo ||
																	repo,
															},
														);
													setRepoPathSuggestions(
														suggestions,
													);
													if (
														suggestions.length >
															0 &&
														!localRepoPath
													) {
														handleLocalRepoPathChange(
															suggestions[0],
														);
													}
												} catch (err) {
													console.error(
														'Failed to suggest repo path:',
														err,
													);
												}
											}}
											className="px-2 py-1.5 bg-mid-gray/30 hover:bg-mid-gray/40 text-gray-300 text-xs rounded transition-colors">
											Detect
										</button>
									</div>
									{repoPathSuggestions.length > 1 && (
										<div className="mt-1 flex flex-wrap gap-1">
											{repoPathSuggestions.map(
												(path, idx) => (
													<button
														key={idx}
														type="button"
														onClick={() =>
															handleLocalRepoPathChange(
																path,
															)
														}
														className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
															localRepoPath ===
															path
																? 'bg-blue-500/30 text-blue-300'
																: 'bg-mid-gray/20 text-gray-400 hover:bg-mid-gray/30'
														}`}>
														{path
															.split('/')
															.slice(-2)
															.join('/')}
													</button>
												),
											)}
										</div>
									)}
									<p className="text-[10px] text-gray-500 mt-1">
										Full filesystem path to a local git repo
										where worktrees will be created
									</p>
								</div>
							)}
						</div>

						{/* Phase buttons - smart detection of next phase */}
						{(() => {
							// Find the next phase to work on
							const nextPhase = activeEpic?.phases.find(
								(p) =>
									p.status === 'not_started' ||
									p.status === 'in_progress',
							);
							const nextPhaseNum = nextPhase?.phase_number ?? 1;
							const allCompleted = activeEpic?.phases.every(
								(p) => p.status === 'completed',
							);
							const phasesNeedingWork = activeEpic?.phases
								.filter(
									(p) =>
										p.status !== 'completed' &&
										p.status !== 'skipped',
								)
								.map((p) => p.phase_number) ?? [1];

							return (
								<div className="flex flex-wrap gap-2">
									{allCompleted ? (
										<div className="text-green-400 text-xs py-1.5">
											✓ All phases complete!
										</div>
									) : (
										<>
											<button
												onClick={() =>
													handleStartOrchestration([
														nextPhaseNum,
													])
												}
												disabled={orchestrating}
												className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs rounded transition-colors disabled:opacity-50">
												{orchestrating
													? 'Starting...'
													: nextPhase?.status ===
														  'in_progress'
														? `Continue Phase ${nextPhaseNum}`
														: `Start Phase ${nextPhaseNum}`}
											</button>
											{phasesNeedingWork.length > 1 && (
												<button
													onClick={() =>
														handleStartOrchestration(
															phasesNeedingWork,
														)
													}
													disabled={orchestrating}
													className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs rounded transition-colors disabled:opacity-50">
													{orchestrating
														? 'Starting...'
														: `Start Phases ${phasesNeedingWork.join(', ')}`}
												</button>
											)}
										</>
									)}
									{/* Individual phase buttons for manual control */}
									{result.phases.length > 1 && (
										<div className="w-full mt-2 flex flex-wrap gap-1">
											{result.phases.map((phase, idx) => {
												const phaseNum = idx + 1;
												const phaseState =
													activeEpic?.phases.find(
														(p) =>
															p.phase_number ===
															phaseNum,
													);
												const isComplete =
													phaseState?.status ===
													'completed';
												return (
													<button
														key={phaseNum}
														onClick={() =>
															handleStartOrchestration(
																[phaseNum],
															)
														}
														disabled={
															orchestrating ||
															isComplete
														}
														className={`px-2 py-1 text-[10px] rounded transition-colors ${
															isComplete
																? 'bg-green-500/20 text-green-400 cursor-not-allowed'
																: 'bg-mid-gray/20 hover:bg-mid-gray/30 text-gray-400'
														}`}
														title={phase.name}>
														{isComplete
															? `✓ P${phaseNum}`
															: `P${phaseNum}`}
													</button>
												);
											})}
										</div>
									)}
								</div>
							);
						})()}
					</div>
				)}

				{/* Action buttons */}
				<div className="flex flex-wrap gap-2 mt-3">
					{isLinkedEpic && (
						<>
							<button
								onClick={handleSyncEpic}
								disabled={epicLoading}
								className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm rounded transition-colors disabled:opacity-50">
								{epicLoading ? 'Syncing...' : 'Sync Status'}
							</button>
							<button
								onClick={handleUpdateEpicOnGithub}
								disabled={epicLoading}
								className="flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm rounded transition-colors disabled:opacity-50"
								title="Update the Epic issue on GitHub with current phase status">
								Update Epic Issue
							</button>
							<button
								onClick={() => resetForm(true)}
								className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm rounded transition-colors">
								Unlink
							</button>
						</>
					)}
					<button
						onClick={() => resetForm(false)}
						className="flex-1 px-4 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors">
						{isLinkedEpic
							? 'Link Different Epic'
							: 'Create Another Epic'}
					</button>
				</div>

				{/* Persistence indicator */}
				{activeEpic && (
					<div className="text-xs text-green-400/70 text-center mt-2">
						✓ Epic state is persisted and will survive app restarts
					</div>
				)}
			</div>
		);
	}

	// Render the mode toggle for Step 1
	const renderModeToggle = () => (
		<div className="flex gap-2 mb-4">
			<button
				onClick={() => setCreateMode('new')}
				className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
					createMode === 'new'
						? 'bg-blue-600 text-white'
						: 'bg-mid-gray/20 text-gray-400 hover:bg-mid-gray/30'
				}`}>
				Create New Epic
			</button>
			<button
				onClick={() => setCreateMode('link')}
				className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
					createMode === 'link'
						? 'bg-blue-600 text-white'
						: 'bg-mid-gray/20 text-gray-400 hover:bg-mid-gray/30'
				}`}>
				Link Existing Epic
			</button>
		</div>
	);

	// Render the Link Existing Epic form
	const renderLinkForm = () => (
		<div className="space-y-3">
			<div>
				<label className="block text-xs text-gray-400 mb-1.5">
					Repository <span className="text-red-400">*</span>
				</label>
				<input
					type="text"
					value={linkRepo}
					onChange={(e) => setLinkRepo(e.target.value)}
					placeholder="org/repo"
					className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
				/>
			</div>

			<div>
				<label className="block text-xs text-gray-400 mb-1.5">
					Epic Issue Number <span className="text-red-400">*</span>
				</label>
				<input
					type="text"
					value={linkEpicNumber}
					onChange={(e) =>
						setLinkEpicNumber(e.target.value.replace(/\D/g, ''))
					}
					placeholder="e.g., 123"
					className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
				/>
				<div className="mt-1 text-xs text-gray-500">
					Enter the GitHub issue number of an existing epic to link
					and continue orchestration
				</div>
			</div>

			{error && (
				<div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
					<strong>Error:</strong> {error}
				</div>
			)}

			<button
				onClick={handleLinkEpic}
				disabled={linking || !linkRepo.trim() || !linkEpicNumber.trim()}
				className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors font-medium">
				{linking ? 'Linking Epic...' : 'Link Epic'}
			</button>
		</div>
	);

	// Render the Create New Epic template selection form
	const renderNewEpicForm = () => {
		const selectedTemplateData = templates.find(
			(t) => t.id === selectedTemplate,
		);

		return (
			<div className="space-y-3">
				{templatesLoading && (
					<div className="text-xs text-gray-400 py-2">
						Loading templates...
					</div>
				)}

				{templatesError && (
					<div className="text-xs text-yellow-400 py-2">
						Note: Using fallback templates (could not load from
						docs/plans/)
					</div>
				)}

				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Choose Template
					</label>
					<select
						value={selectedTemplate}
						onChange={(e) => handleTemplateChange(e.target.value)}
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
						disabled={templatesLoading}>
						{templates.map((template) => (
							<option key={template.id} value={template.id}>
								{template.title || 'Blank (Start from scratch)'}{' '}
								{template.description &&
									`- ${template.description}`}
							</option>
						))}
					</select>
				</div>

				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Tracking Repository{' '}
						<span className="text-gray-500">
							(where Epic/Sub-issues are created)
						</span>
					</label>
					<input
						type="text"
						value={repo}
						onChange={(e) => setRepo(e.target.value)}
						placeholder="org/repo"
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
					/>
				</div>

				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Work Repository{' '}
						<span className="text-gray-500">
							(optional - where code lives and agents work)
						</span>
					</label>
					<input
						type="text"
						value={workRepo}
						onChange={(e) => setWorkRepo(e.target.value)}
						placeholder="Leave empty to use tracking repo"
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
					/>
					<div className="mt-1 text-xs text-gray-500">
						If your issues are tracked in one repo but code lives in
						another
					</div>
				</div>

				{selectedTemplate !== 'blank' && selectedTemplateData && (
					<div className="p-3 bg-mid-gray/5 border border-mid-gray/10 rounded space-y-2">
						<div className="text-xs">
							<div className="text-gray-400">
								Template Preview:
							</div>
							<div className="text-gray-300 mt-1">
								{selectedTemplateData.goal}
							</div>
						</div>
						<div className="text-xs">
							<div className="text-gray-400">
								Phases: {selectedTemplateData.phases.length} |
								Metrics:{' '}
								{selectedTemplateData.success_metrics.length}
							</div>
						</div>
					</div>
				)}

				<button
					onClick={handleTemplateSelect}
					disabled={!repo.trim()}
					className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors font-medium">
					Next: Edit Plan →
				</button>
			</div>
		);
	};

	// Main wizard - use single container with hidden sections to avoid DOM unmounting issues
	// This prevents OverlayScrollbars from breaking when steps change
	return (
		<div className="space-y-4">
			{/* Step 1: Template Selection or Link Existing */}
			<div className={currentStep === 'template' ? '' : 'hidden'}>
				{renderModeToggle()}
				{createMode === 'link' ? renderLinkForm() : renderNewEpicForm()}
			</div>

			{/* Step 2: Edit Plan */}
			<div
				className={
					currentStep === 'edit'
						? 'space-y-4 max-h-[600px] overflow-y-auto pr-2'
						: 'hidden'
				}>
				{/* Title */}
				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Epic Title <span className="text-red-400">*</span>
					</label>
					<input
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="e.g., CICD Testing Infrastructure"
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
					/>
				</div>

				{/* Goal */}
				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Goal <span className="text-red-400">*</span>
					</label>
					<textarea
						value={goal}
						onChange={(e) => setGoal(e.target.value)}
						placeholder="1-2 sentence description of what this Epic aims to achieve"
						rows={3}
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
					/>
				</div>

				{/* Success Metrics */}
				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Success Metrics
					</label>
					<div className="space-y-2">
						{successMetrics.map((metric, index) => (
							<div
								key={index}
								className="flex items-center gap-2">
								<span className="text-xs text-gray-400">□</span>
								<span className="flex-1 text-sm text-gray-300">
									{metric}
								</span>
								<button
									onClick={() => removeSuccessMetric(index)}
									className="text-xs text-red-400 hover:text-red-300">
									Remove
								</button>
							</div>
						))}
						<div className="flex gap-2">
							<input
								type="text"
								value={newMetric}
								onChange={(e) => setNewMetric(e.target.value)}
								onKeyPress={(e) =>
									e.key === 'Enter' && addSuccessMetric()
								}
								placeholder="Add success metric..."
								className="flex-1 px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
							/>
							<button
								onClick={addSuccessMetric}
								className="px-3 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors">
								Add
							</button>
						</div>
					</div>
				</div>

				{/* Phases */}
				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Phases <span className="text-red-400">*</span>
					</label>
					<div className="space-y-3">
						{phases.map((phase, index) => (
							<div
								key={index}
								className="p-3 bg-mid-gray/5 border border-mid-gray/10 rounded space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-xs text-gray-400">
										Phase {index + 1}
									</span>
									<div className="flex gap-1">
										<button
											onClick={() => movePhaseUp(index)}
											disabled={index === 0}
											className="text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
											↑
										</button>
										<button
											onClick={() => movePhaseDown(index)}
											disabled={
												index === phases.length - 1
											}
											className="text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
											↓
										</button>
										<button
											onClick={() => removePhase(index)}
											className="text-xs text-red-400 hover:text-red-300 ml-2">
											Remove
										</button>
									</div>
								</div>
								<input
									type="text"
									value={phase.name}
									onChange={(e) =>
										updatePhase(
											index,
											'name',
											e.target.value,
										)
									}
									placeholder="Phase name"
									className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
								/>
								<textarea
									value={phase.description}
									onChange={(e) =>
										updatePhase(
											index,
											'description',
											e.target.value,
										)
									}
									placeholder="Phase description"
									rows={2}
									className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
								/>
								<select
									value={phase.approach}
									onChange={(e) =>
										updatePhase(
											index,
											'approach',
											e.target.value,
										)
									}
									className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500">
									<option value="manual">Manual</option>
									<option value="agent-assisted">
										Agent-Assisted
									</option>
									<option value="automated">Automated</option>
								</select>
							</div>
						))}
						<button
							onClick={addPhase}
							className="w-full px-3 py-2 bg-mid-gray/10 hover:bg-mid-gray/20 border border-dashed border-mid-gray/30 rounded text-sm text-gray-400 hover:text-white transition-colors">
							+ Add Phase
						</button>
					</div>
				</div>

				{/* Labels */}
				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Labels
					</label>
					<div className="flex flex-wrap gap-2 mb-2">
						{labels.map((label, index) => (
							<div
								key={index}
								className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-300">
								{label}
								<button
									onClick={() => removeLabel(index)}
									className="text-blue-400 hover:text-blue-200">
									×
								</button>
							</div>
						))}
					</div>
					<div className="flex gap-2">
						<input
							type="text"
							value={newLabel}
							onChange={(e) => setNewLabel(e.target.value)}
							onKeyPress={(e) => e.key === 'Enter' && addLabel()}
							placeholder="Add label..."
							className="flex-1 px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500"
						/>
						<button
							onClick={addLabel}
							className="px-3 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors">
							Add
						</button>
					</div>
				</div>

				{/* Navigation */}
				<div className="flex gap-2 pt-4 border-t border-mid-gray/20">
					<button
						onClick={() => setCurrentStep('template')}
						className="flex-1 px-4 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors">
						← Back
					</button>
					<button
						onClick={() => setCurrentStep('review')}
						disabled={
							!title.trim() || !goal.trim() || phases.length === 0
						}
						className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors font-medium">
						Review Plan →
					</button>
				</div>
			</div>

			{/* Step 3: Review & Create */}
			<div
				className={
					currentStep === 'review'
						? 'space-y-4 max-h-[600px] overflow-y-auto pr-2'
						: 'hidden'
				}>
				<div className="p-4 bg-mid-gray/5 border border-mid-gray/10 rounded space-y-3">
					<div>
						<div className="text-xs text-gray-400">Title</div>
						<div className="text-sm text-white font-medium">
							[EPIC] {title}
						</div>
					</div>
					<div>
						<div className="text-xs text-gray-400">Repository</div>
						<div className="text-sm text-white font-mono">
							{repo}
						</div>
					</div>
					<div>
						<div className="text-xs text-gray-400">Goal</div>
						<div className="text-sm text-gray-300">{goal}</div>
					</div>
					{successMetrics.length > 0 && (
						<div>
							<div className="text-xs text-gray-400 mb-1">
								Success Metrics
							</div>
							{successMetrics.map((metric, i) => (
								<div key={i} className="text-sm text-gray-300">
									□ {metric}
								</div>
							))}
						</div>
					)}
					<div>
						<div className="text-xs text-gray-400 mb-1">
							Phases ({phases.length})
						</div>
						{phases.map((phase, i) => (
							<div key={i} className="text-sm text-gray-300 mb-1">
								{i + 1}. <strong>{phase.name}</strong> (
								{phase.approach})
							</div>
						))}
					</div>
					{labels.length > 0 && (
						<div>
							<div className="text-xs text-gray-400 mb-1">
								Labels
							</div>
							<div className="flex flex-wrap gap-1">
								{labels.map((label, i) => (
									<span
										key={i}
										className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-300">
										{label}
									</span>
								))}
							</div>
						</div>
					)}
				</div>

				{error && (
					<div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
						<strong>Error:</strong> {error}
					</div>
				)}

				<div className="flex gap-2 pt-4 border-t border-mid-gray/20">
					<button
						onClick={() => setCurrentStep('edit')}
						disabled={creating}
						className="flex-1 px-4 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 disabled:opacity-50 text-white text-sm rounded transition-colors">
						← Edit
					</button>
					<button
						onClick={handleCreateEpic}
						disabled={creating}
						className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors font-medium">
						{creating ? 'Creating Epic...' : 'Create Epic ✓'}
					</button>
				</div>
			</div>
		</div>
	);
}
