import { useEffect, type ReactNode } from 'react';
import { useLauncher } from './store';

function pct(received: number, total: number): number {
	if (!total) return 0;
	return Math.min(100, Math.round((received / total) * 100));
}

export default function App() {
	const s = useLauncher();
	useEffect(() => {
		void s.refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const latest = s.latest();
	const installing = s.phase === 'installing';
	const action = !s.installed
		? 'Install'
		: s.needsUpdate()
			? 'Update'
			: 'Play';

	const onClick = () => {
		if (action === 'Play') void s.play();
		else void s.installOrUpdate();
	};

	return (
		<div className="flex min-h-full items-center justify-center p-6">
			<div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-8">
				<h1 className="mb-1 text-2xl font-bold text-violet-300">
					ChuckRPG
				</h1>
				<p className="mb-6 text-sm text-neutral-400">
					{s.platform
						? `Platform: ${s.platform}`
						: 'Detecting platform…'}
				</p>

				<div className="mb-6 space-y-2 text-sm">
					<Row label="Latest build">
						{latest?.user_version
							? `v${latest.user_version}${latest.live ? '' : ' (processing)'}`
							: '—'}
					</Row>
					<Row label="Installed">
						{s.installed?.user_version
							? `v${s.installed.user_version}`
							: 'not installed'}
					</Row>
				</div>

				{installing && (
					<div className="mb-4">
						<div className="h-2 w-full overflow-hidden rounded bg-neutral-800">
							<div
								className="h-full bg-violet-500 transition-[width]"
								style={{
									width: `${pct(s.progress?.received ?? 0, s.progress?.total ?? 0)}%`,
								}}
							/>
						</div>
						<p className="mt-1 text-xs text-neutral-500">
							{pct(
								s.progress?.received ?? 0,
								s.progress?.total ?? 0,
							)}
							% — downloading…
						</p>
					</div>
				)}

				{s.error && (
					<p className="mb-4 text-sm text-red-400">{s.error}</p>
				)}

				<button
					onClick={onClick}
					disabled={
						installing ||
						s.phase === 'loading' ||
						(action !== 'Play' && !latest?.live)
					}
					className="w-full rounded-lg bg-violet-500 px-4 py-3 font-semibold text-black transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400">
					{installing ? 'Installing…' : action}
				</button>

				<button
					onClick={() => void s.refresh()}
					disabled={installing}
					className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200">
					Refresh
				</button>
			</div>
		</div>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex justify-between border-b border-neutral-800 pb-1">
			<span className="text-neutral-500">{label}</span>
			<span className="font-medium">{children}</span>
		</div>
	);
}
