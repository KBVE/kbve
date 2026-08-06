import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { EpicConfig, EpicInfo, PhaseConfig } from '../../../bindings';

export function EpicCreator() {
	const [creating, setCreating] = useState(false);
	const [result, setResult] = useState<EpicInfo | null>(null);
	const [error, setError] = useState<string | null>(null);

	const createCICDEpic = async () => {
		setCreating(true);
		setError(null);
		setResult(null);

		try {
			const phases: PhaseConfig[] = [
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
			];

			const config: EpicConfig = {
				title: 'CICD Testing Infrastructure',
				repo: 'KBVE/Handy',
				work_repo: 'KBVE/Handy',
				goal: 'Build comprehensive testing and CI/CD infrastructure for the multi-agent DevOps system to ensure production readiness and prevent future breakage.',
				success_metrics: [
					'100+ total tests',
					'>70% code coverage',
					'CI/CD running on all PRs',
					'Pre-commit hooks active',
					'All phases complete',
				],
				phases,
				labels: ['cicd', 'testing', 'high-priority'],
			};

			const epicInfo = await invoke<EpicInfo>('create_epic', { config });
			setResult(epicInfo);
			console.log('Epic created:', epicInfo);
		} catch (err) {
			setError(err as string);
			console.error('Failed to create epic:', err);
		} finally {
			setCreating(false);
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium text-white">
						Epic Creator
					</h3>
					<p className="text-xs text-gray-400 mt-1">
						Create Epic #100: CICD Testing Infrastructure
					</p>
				</div>
				<button
					onClick={createCICDEpic}
					disabled={creating || result !== null}
					className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors">
					{creating
						? 'Creating...'
						: result
							? 'Epic Created ✓'
							: 'Create Epic #100'}
				</button>
			</div>

			{error && (
				<div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
					<strong>Error:</strong> {error}
				</div>
			)}

			{result && (
				<div className="p-4 bg-green-500/10 border border-green-500/20 rounded space-y-2">
					<div className="flex items-center gap-2">
						<span className="text-green-400 text-lg">✓</span>
						<span className="text-sm font-medium text-white">
							Epic Created Successfully!
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
					<div className="mt-3 pt-3 border-t border-green-500/20 text-xs text-gray-400">
						<strong>Next steps:</strong>
						<ol className="mt-1 ml-4 list-decimal space-y-1">
							<li>Create sub-issue for Phase 1 implementation</li>
							<li>Implement test utilities manually</li>
							<li>Create sub-issues for Phase 2-4</li>
							<li>Spawn agents for Phase 2+ tasks</li>
						</ol>
					</div>
				</div>
			)}
		</div>
	);
}
