import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { commands } from '@/bindings';
import type { PlanFromMarkdownConfig, PlanResult } from '../../../bindings';

export function MarkdownEpicPlanner() {
	const [planFilePath, setPlanFilePath] = useState<string>('');
	const [repo, setRepo] = useState<string>('KBVE/Handy');
	const [workRepo, setWorkRepo] = useState<string>('');
	const [titleOverride, setTitleOverride] = useState<string>('');
	const [agentType, setAgentType] = useState<string>('');
	const [enabledAgents, setEnabledAgents] = useState<string[]>([]);
	const [planning, setPlanning] = useState(false);
	const [result, setResult] = useState<PlanResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Load enabled agents on mount
	useEffect(() => {
		const loadAgents = async () => {
			try {
				const agents = await commands.getEnabledAgents();
				setEnabledAgents(agents);
				if (agents.length > 0 && !agentType) {
					setAgentType(agents[0]); // Default to first enabled agent
				}
			} catch (err) {
				console.error('Failed to load enabled agents:', err);
			}
		};
		loadAgents();
	}, []);

	const planEpic = async () => {
		if (!planFilePath.trim()) {
			setError('Please select a markdown file');
			return;
		}

		setPlanning(true);
		setError(null);
		setResult(null);

		try {
			const config: PlanFromMarkdownConfig = {
				plan_file_path: planFilePath,
				repo,
				work_repo: workRepo.trim() || null,
				title_override: titleOverride.trim() || null,
				planning_agent: agentType || null,
			};

			const planResult = await invoke<PlanResult>(
				'plan_epic_from_markdown',
				{
					config,
				},
			);
			setResult(planResult);
			console.log('Epic planned:', planResult);
		} catch (err) {
			setError(err as string);
			console.error('Failed to plan epic:', err);
		} finally {
			setPlanning(false);
		}
	};

	return (
		<div className="space-y-4">
			<div className="space-y-3">
				{/* File Path Input */}
				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Markdown Plan File Path
					</label>
					<input
						type="text"
						value={planFilePath}
						onChange={(e) => setPlanFilePath(e.target.value)}
						disabled={planning || result !== null}
						placeholder="/path/to/plan.md"
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
					/>
					<div className="mt-1 text-xs text-gray-500">
						Example: ~/.claude/plans/my-project-plan.md
					</div>
				</div>

				{/* Repository */}
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
						disabled={planning || result !== null}
						placeholder="org/repo"
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
					/>
				</div>

				{/* Work Repository */}
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
						disabled={planning || result !== null}
						placeholder="Leave empty to use tracking repo"
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
					/>
				</div>

				{/* Title Override (Optional) */}
				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Epic Title Override{' '}
						<span className="text-gray-500">(optional)</span>
					</label>
					<input
						type="text"
						value={titleOverride}
						onChange={(e) => setTitleOverride(e.target.value)}
						disabled={planning || result !== null}
						placeholder="Leave empty to extract from plan"
						className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
					/>
				</div>

				{/* Agent Type */}
				<div>
					<label className="block text-xs text-gray-400 mb-1.5">
						Planning Agent{' '}
						{enabledAgents.length === 0 && (
							<span className="text-yellow-400">
								(No agents enabled)
							</span>
						)}
					</label>
					{enabledAgents.length > 0 ? (
						<select
							value={agentType}
							onChange={(e) => setAgentType(e.target.value)}
							disabled={planning || result !== null}
							className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
							{enabledAgents.map((agent) => (
								<option key={agent} value={agent}>
									{agent}
								</option>
							))}
						</select>
					) : (
						<div className="w-full px-3 py-2 bg-mid-gray/10 border border-mid-gray/20 rounded text-sm text-gray-500">
							Enable at least one agent in the "AI Coding Agents"
							section above
						</div>
					)}
				</div>
			</div>

			{/* Plan Button */}
			<button
				onClick={planEpic}
				disabled={
					planning ||
					result !== null ||
					!planFilePath.trim() ||
					!repo.trim()
				}
				className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors font-medium">
				{planning
					? 'Planning Epic...'
					: result
						? 'Epic Planned ✓'
						: 'Plan Epic from Markdown'}
			</button>

			{/* Error Display */}
			{error && (
				<div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400 space-y-1">
					<strong>Error:</strong>
					<pre className="mt-2 text-xs whitespace-pre-wrap">
						{error}
					</pre>
				</div>
			)}

			{/* Success Display */}
			{result && (
				<div className="p-4 bg-green-500/10 border border-green-500/20 rounded space-y-3">
					<div className="flex items-center gap-2">
						<span className="text-green-400 text-lg">✓</span>
						<span className="text-sm font-medium text-white">
							Epic Planned Successfully!
						</span>
					</div>

					<div className="space-y-1 text-xs text-gray-300">
						<div>
							<span className="text-gray-400">Summary:</span>{' '}
							<span className="text-white">{result.summary}</span>
						</div>
						<div>
							<span className="text-gray-400">Epic Number:</span>{' '}
							<span className="font-mono text-white">
								#{result.epic.epic_number}
							</span>
						</div>
						<div>
							<span className="text-gray-400">Repository:</span>{' '}
							<span className="font-mono text-white">
								{result.epic.repo}
							</span>
						</div>
						<div>
							<span className="text-gray-400">
								Sub-issues Created:
							</span>{' '}
							<span className="text-white">
								{result.sub_issues.length}
							</span>
						</div>
						<div>
							<span className="text-gray-400">
								Planning Agent:
							</span>{' '}
							<span className="text-white">
								{result.planning_agent}
							</span>
						</div>
					</div>

					<div className="mt-2">
						<a
							href={result.epic.url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline text-sm">
							View Epic on GitHub →
						</a>
					</div>

					{/* Sub-issues List */}
					{result.sub_issues.length > 0 && (
						<div className="mt-3 pt-3 border-t border-green-500/20">
							<div className="text-xs text-gray-400 mb-2">
								<strong>Created Sub-issues:</strong>
							</div>
							<div className="space-y-1 max-h-40 overflow-y-auto">
								{result.sub_issues.map((issue) => (
									<div
										key={issue.issue_number}
										className="text-xs text-gray-300 flex items-start gap-2">
										<span className="font-mono text-gray-400">
											#{issue.issue_number}
										</span>
										<a
											href={issue.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-400 hover:text-blue-300 underline flex-1">
											{issue.title}
										</a>
									</div>
								))}
							</div>
						</div>
					)}

					<div className="mt-3 pt-3 border-t border-green-500/20 text-xs text-gray-400">
						<strong>Next steps:</strong>
						<ol className="mt-1 ml-4 list-decimal space-y-1">
							<li>Review Epic and sub-issues on GitHub</li>
							<li>Implement manual phases</li>
							<li>Spawn agents for agent-assisted phases</li>
						</ol>
					</div>

					<button
						onClick={() => {
							setResult(null);
							setPlanFilePath('');
							setWorkRepo('');
							setTitleOverride('');
						}}
						className="w-full mt-3 px-4 py-2 bg-mid-gray/20 hover:bg-mid-gray/30 text-white text-sm rounded transition-colors">
						Plan Another Epic
					</button>
				</div>
			)}
		</div>
	);
}
