import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	commands,
	DevOpsDependencies,
	ClaudeAuthVolumeStatus,
} from '@/bindings';
import { SettingsGroup } from '../../ui/SettingsGroup';
import { DependencyStatus } from './DependencyStatus';
import { SessionManager } from './SessionManager';
import { WorktreeManager } from './WorktreeManager';
import { IssueQueue } from './IssueQueue';
import { PullRequestPanel } from './PullRequestPanel';
import { AgentDashboard } from './AgentDashboard';
import { GenericEpicCreator } from './GenericEpicCreator';
import { MarkdownEpicPlanner } from './MarkdownEpicPlanner';
import {
	initializeDevOpsStore,
	cleanupDevOpsStore,
} from '@/stores/devopsStore';
import {
	Terminal,
	GitBranch,
	RefreshCcw,
	Loader2,
	AlertCircle,
	CheckCircle2,
	Bot,
	Sparkles,
	Code2,
	Server,
	Cpu,
	Container,
	Key,
} from 'lucide-react';

export const DevOpsSettings: React.FC = () => {
	const { t } = useTranslation();
	const [dependencies, setDependencies] = useState<DevOpsDependencies | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [enabledAgents, setEnabledAgents] = useState<string[]>([]);
	const [isTogglingAgent, setIsTogglingAgent] = useState<string | null>(null);
	const [sandboxEnabled, setSandboxEnabled] = useState(false);
	const [isTogglingSandbox, setIsTogglingSandbox] = useState(false);
	const [claudeAuthVolume, setClaudeAuthVolume] =
		useState<ClaudeAuthVolumeStatus | null>(null);
	const [isCheckingAuthVolume, setIsCheckingAuthVolume] = useState(false);
	const [isLaunchingAuthSetup, setIsLaunchingAuthSetup] = useState(false);

	const checkClaudeAuthVolume = async () => {
		setIsCheckingAuthVolume(true);
		try {
			const result = await commands.checkClaudeAuthVolume();
			if (result.status === 'ok') {
				setClaudeAuthVolume(result.data);
			}
		} catch (err) {
			console.error('Failed to check Claude auth volume:', err);
		} finally {
			setIsCheckingAuthVolume(false);
		}
	};

	const handleLaunchAuthSetup = async () => {
		setIsLaunchingAuthSetup(true);
		try {
			const result = await commands.launchClaudeAuthSetup();
			if (result.status === 'ok') {
				// Show a message that Terminal was opened
				// Check auth status after a delay (user needs time to complete auth)
				setTimeout(() => {
					checkClaudeAuthVolume();
				}, 10000);
			} else {
				setError(result.error);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsLaunchingAuthSetup(false);
		}
	};

	const checkDependencies = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await commands.checkDevopsDependencies();
			if (result.status === 'ok') {
				setDependencies(result.data);
			} else {
				setError(result.error);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		const loadEnabledAgents = async () => {
			try {
				const agents = await commands.getEnabledAgents();
				setEnabledAgents(agents);
			} catch (err) {
				console.error('Failed to load enabled agents:', err);
			}
		};

		const loadSandboxSetting = async () => {
			try {
				const enabled = await commands.getSandboxEnabled();
				setSandboxEnabled(enabled);
			} catch (err) {
				console.error('Failed to load sandbox setting:', err);
			}
		};

		void Promise.resolve().then(() => {
			checkDependencies();
			loadEnabledAgents();
			loadSandboxSetting();
			checkClaudeAuthVolume();

			// Initialize DevOps store for agents and sessions
			initializeDevOpsStore();
		});

		// Cleanup on unmount
		return () => {
			cleanupDevOpsStore();
		};
	}, []);

	const handleAgentToggle = async (agentType: string, enabled: boolean) => {
		setIsTogglingAgent(agentType);
		try {
			const result = await commands.toggleAgentEnabled(
				agentType,
				enabled,
			);
			if (result.status === 'ok') {
				setEnabledAgents(result.data);
			} else {
				setError(result.error);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsTogglingAgent(null);
		}
	};

	const isAgentEnabled = (agentType: string) =>
		enabledAgents.includes(agentType);

	const handleSandboxToggle = async (enabled: boolean) => {
		setIsTogglingSandbox(true);
		try {
			const result = await commands.setSandboxEnabled(enabled);
			setSandboxEnabled(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsTogglingSandbox(false);
		}
	};

	const [launchingAuth, setLaunchingAuth] = useState<string | null>(null);

	const handleLaunchAuth = async (toolName: string) => {
		setLaunchingAuth(toolName);
		try {
			const result = await commands.launchCliAuth(toolName);
			if (result.status === 'ok') {
				// Auth session launched successfully
				// Refresh dependencies after a delay to check if user authenticated
				setTimeout(() => {
					checkDependencies();
				}, 5000);
			} else {
				setError(result.error);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLaunchingAuth(null);
		}
	};

	return (
		<div className="max-w-3xl w-full mx-auto space-y-6">
			{/* Description and refresh */}
			<div className="flex items-center justify-between">
				<p className="text-sm text-mid-gray">
					{t('devops.description')}
				</p>
				<button
					onClick={checkDependencies}
					disabled={isLoading}
					className="flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-mid-gray/20 transition-colors disabled:opacity-50">
					{isLoading ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						<RefreshCcw className="w-4 h-4" />
					)}
					{t('devops.refresh')}
				</button>
			</div>

			{/* Error state */}
			{error && (
				<div className="flex items-center gap-2 p-4 bg-red-500/10 rounded-lg text-red-400">
					<AlertCircle className="w-4 h-4" />
					<span className="text-sm">{error}</span>
				</div>
			)}

			{/* Dependencies Section */}
			<SettingsGroup
				title={t('devops.dependencies.title')}
				description={t('devops.dependencies.description')}>
				{isLoading ? (
					<div className="flex items-center justify-center p-4">
						<Loader2 className="w-6 h-6 animate-spin text-logo-primary" />
					</div>
				) : dependencies ? (
					<div className="flex flex-col gap-3">
						{/* Overall status */}
						<div className="flex items-center gap-2 p-4 border-b border-mid-gray/20">
							{dependencies.all_satisfied ? (
								<>
									<CheckCircle2 className="w-5 h-5 text-green-400" />
									<span className="text-sm text-green-400">
										{t('devops.dependencies.allSatisfied')}
									</span>
								</>
							) : (
								<>
									<AlertCircle className="w-5 h-5 text-yellow-400" />
									<span className="text-sm text-yellow-400">
										{t('devops.dependencies.missing')}
									</span>
								</>
							)}
						</div>

						{/* Required dependencies */}
						<div className="text-xs text-mid-gray/70 mb-3 mt-3 px-1">
							{t('devops.dependencies.required')}
						</div>
						<DependencyStatus
							name="gh"
							displayName="GitHub CLI"
							icon={<GitBranch className="w-4 h-4" />}
							status={dependencies.gh}
							onLaunchAuth={() => handleLaunchAuth('gh')}
							launchAuthDisabled={launchingAuth === 'gh'}
						/>
						<DependencyStatus
							name="tmux"
							displayName="tmux"
							icon={<Terminal className="w-4 h-4" />}
							status={dependencies.tmux}
						/>

						{/* Optional: Docker for sandboxed agents */}
						<div className="text-xs text-mid-gray/70 mb-3 mt-5 px-1">
							{t('devops.dependencies.optional')}
						</div>
						<DependencyStatus
							name="docker"
							displayName="Docker"
							icon={<Container className="w-4 h-4" />}
							status={dependencies.docker}
						/>
						{dependencies.sandbox_available ? (
							<div className="ml-8 space-y-2">
								<div className="text-xs text-green-400/70">
									{t('devops.dependencies.sandboxAvailable')}
								</div>
								{/* Sandbox toggle */}
								<div className="flex items-center justify-between bg-dark-gray/30 rounded px-3 py-2">
									<div>
										<div className="text-xs text-white font-medium">
											{t(
												'devops.sandbox.enableLabel',
												'Run agents in Docker',
											)}
										</div>
										<div className="text-[10px] text-gray-400">
											{t(
												'devops.sandbox.enableDescription',
												'Isolate agents in containers for safety',
											)}
										</div>
									</div>
									<button
										onClick={() =>
											handleSandboxToggle(!sandboxEnabled)
										}
										disabled={isTogglingSandbox}
										className={`relative w-10 h-5 rounded-full transition-colors ${
											sandboxEnabled
												? 'bg-green-500'
												: 'bg-gray-600'
										} ${isTogglingSandbox ? 'opacity-50' : ''}`}>
										<span
											className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
												sandboxEnabled
													? 'translate-x-5'
													: 'translate-x-0'
											}`}
										/>
									</button>
								</div>

								{/* Claude Code Authentication Volume - shown when sandbox is enabled */}
								{sandboxEnabled && (
									<div className="mt-3 bg-dark-gray/30 rounded px-3 py-2">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Key className="w-4 h-4 text-mid-gray" />
												<div>
													<div className="text-xs text-white font-medium">
														{t(
															'devops.sandbox.claudeAuthLabel',
															'Claude Code Auth Volume',
														)}
													</div>
													<div className="text-[10px] text-gray-400">
														{claudeAuthVolume?.has_auth
															? t(
																	'devops.sandbox.claudeAuthReady',
																	'Credentials ready for sandbox use',
																)
															: t(
																	'devops.sandbox.claudeAuthNeeded',
																	'Login required for sandbox agents',
																)}
													</div>
												</div>
											</div>
											<div className="flex items-center gap-2">
												{isCheckingAuthVolume ? (
													<Loader2 className="w-4 h-4 animate-spin text-mid-gray" />
												) : claudeAuthVolume?.has_auth ? (
													<CheckCircle2 className="w-4 h-4 text-green-400" />
												) : (
													<AlertCircle className="w-4 h-4 text-yellow-400" />
												)}
												<button
													onClick={
														handleLaunchAuthSetup
													}
													disabled={
														isLaunchingAuthSetup
													}
													className="text-[10px] px-2 py-1 bg-logo-primary/20 hover:bg-logo-primary/30 text-logo-primary rounded transition-colors disabled:opacity-50">
													{isLaunchingAuthSetup ? (
														<Loader2 className="w-3 h-3 animate-spin" />
													) : claudeAuthVolume?.has_auth ? (
														t(
															'devops.sandbox.claudeAuthRefresh',
															'Re-authenticate',
														)
													) : (
														t(
															'devops.sandbox.claudeAuthSetup',
															'Setup Auth',
														)
													)}
												</button>
												<button
													onClick={
														checkClaudeAuthVolume
													}
													disabled={
														isCheckingAuthVolume
													}
													className="text-[10px] px-2 py-1 bg-mid-gray/20 hover:bg-mid-gray/30 text-mid-gray rounded transition-colors disabled:opacity-50"
													title={t(
														'devops.sandbox.claudeAuthCheck',
														'Check auth status',
													)}>
													<RefreshCcw
														className={`w-3 h-3 ${isCheckingAuthVolume ? 'animate-spin' : ''}`}
													/>
												</button>
											</div>
										</div>
										{claudeAuthVolume?.last_auth && (
											<div className="text-[9px] text-gray-500 mt-1">
												{t(
													'devops.sandbox.claudeAuthLastAuth',
													'Last authenticated',
												)}
												: {claudeAuthVolume.last_auth}
											</div>
										)}
									</div>
								)}
							</div>
						) : (
							dependencies.docker.installed &&
							!dependencies.docker.authenticated && (
								<div className="ml-8 text-xs text-yellow-400/70">
									{t('devops.dependencies.daemonNotRunning')}
								</div>
							)
						)}

						{/* AI Agents (at least one required) */}
						<div className="text-xs text-mid-gray/70 mb-3 mt-5 px-1">
							{t('devops.dependencies.agents')}
						</div>
						<DependencyStatus
							name="claude"
							displayName="Claude Code"
							icon={<Bot className="w-4 h-4" />}
							status={dependencies.claude}
							showToggle
							isEnabled={isAgentEnabled('claude')}
							onToggle={(enabled) =>
								handleAgentToggle('claude', enabled)
							}
							toggleDisabled={isTogglingAgent === 'claude'}
							onLaunchAuth={() => handleLaunchAuth('claude')}
							launchAuthDisabled={launchingAuth === 'claude'}
						/>
						<DependencyStatus
							name="aider"
							displayName="Aider"
							icon={<Code2 className="w-4 h-4" />}
							status={dependencies.aider}
							showToggle
							isEnabled={isAgentEnabled('aider')}
							onToggle={(enabled) =>
								handleAgentToggle('aider', enabled)
							}
							toggleDisabled={isTogglingAgent === 'aider'}
						/>
						<DependencyStatus
							name="gemini"
							displayName="Gemini"
							icon={<Sparkles className="w-4 h-4" />}
							status={dependencies.gemini}
							showToggle
							isEnabled={isAgentEnabled('gemini')}
							onToggle={(enabled) =>
								handleAgentToggle('gemini', enabled)
							}
							toggleDisabled={isTogglingAgent === 'gemini'}
						/>

						{/* Local LLM Servers */}
						<div className="text-xs text-mid-gray/70 mb-3 mt-5 px-1">
							{t('devops.dependencies.localLlm')}
						</div>
						<DependencyStatus
							name="ollama"
							displayName="Ollama"
							icon={<Server className="w-4 h-4" />}
							status={dependencies.ollama}
							showToggle
							isEnabled={isAgentEnabled('ollama')}
							onToggle={(enabled) =>
								handleAgentToggle('ollama', enabled)
							}
							toggleDisabled={isTogglingAgent === 'ollama'}
						/>
						<DependencyStatus
							name="vllm"
							displayName="vLLM"
							icon={<Cpu className="w-4 h-4" />}
							status={dependencies.vllm}
							showToggle
							isEnabled={isAgentEnabled('vllm')}
							onToggle={(enabled) =>
								handleAgentToggle('vllm', enabled)
							}
							toggleDisabled={isTogglingAgent === 'vllm'}
						/>

						{/* Enabled agents summary */}
						{enabledAgents.length > 0 && (
							<div className="mt-4 pt-4 px-4 border-t border-mid-gray/20 text-xs text-mid-gray">
								{t('devops.dependencies.enabledAgents')}:{' '}
								{enabledAgents.join(', ')}
							</div>
						)}
					</div>
				) : null}
			</SettingsGroup>

			{/* Epic Workflow Management */}
			{dependencies?.all_satisfied && (
				<>
					<SettingsGroup
						title="Epic Workflow - Predefined Plans"
						description="Create Epic issues from predefined templates">
						<GenericEpicCreator />
					</SettingsGroup>

					<SettingsGroup
						title="Epic Workflow - From Markdown"
						description="AI-assisted Epic planning: analyze markdown plans and automatically generate Epic + Sub-issues">
						<MarkdownEpicPlanner />
					</SettingsGroup>
				</>
			)}

			{/* Active Agents Dashboard */}
			{dependencies?.all_satisfied && (
				<SettingsGroup
					title={t('devops.orchestrator.title')}
					description={t('devops.orchestrator.description')}>
					<AgentDashboard />
				</SettingsGroup>
			)}

			{/* Agent Sessions */}
			{dependencies?.all_satisfied && (
				<SettingsGroup
					title={t('devops.sessions.title')}
					description={t('devops.sessions.description')}>
					<SessionManager onSessionsChange={checkDependencies} />
				</SettingsGroup>
			)}

			{/* Git Worktrees */}
			{dependencies?.all_satisfied && (
				<SettingsGroup
					title={t('devops.worktrees.title')}
					description={t('devops.worktrees.description')}>
					<WorktreeManager />
				</SettingsGroup>
			)}

			{/* GitHub Issues */}
			{dependencies?.gh?.installed && (
				<SettingsGroup
					title={t('devops.issues.title')}
					description={t('devops.issues.description')}>
					<IssueQueue />
				</SettingsGroup>
			)}

			{/* GitHub Pull Requests */}
			{dependencies?.gh?.installed && (
				<SettingsGroup
					title={t('devops.prs.title')}
					description={t('devops.prs.description')}>
					<PullRequestPanel />
				</SettingsGroup>
			)}
		</div>
	);
};
