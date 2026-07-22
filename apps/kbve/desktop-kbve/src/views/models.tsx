import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SettingsCard } from '../components/SettingsCard';
import { commands, type ModelInfo } from '../bindings';

interface DownloadProgress {
	model_id: string;
	downloaded: number;
	total: number;
	percentage: number;
}

const muted = { color: 'var(--color-text-muted)' } as const;

export function ModelsView() {
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [activeId, setActiveId] = useState<string>('');
	const [progress, setProgress] = useState<Record<string, number>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		const list = await commands.getAvailableModels();
		if (list.status === 'ok') setModels(list.data);
		else setError(list.error);
		const current = await commands.getCurrentModel();
		if (current.status === 'ok') setActiveId(current.data);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	useEffect(() => {
		const unlisten = listen<DownloadProgress>(
			'model-download-progress',
			(e) => {
				setProgress((p) => ({
					...p,
					[e.payload.model_id]: e.payload.percentage,
				}));
			},
		);
		const unlistenDone = listen<string>('model-download-complete', () => {
			setProgress({});
			refresh();
		});
		return () => {
			unlisten.then((f) => f());
			unlistenDone.then((f) => f());
		};
	}, [refresh]);

	const download = async (id: string) => {
		setBusy(id);
		setError(null);
		const res = await commands.downloadModel(id);
		if (res.status === 'error') setError(res.error);
		setBusy(null);
		refresh();
	};

	const remove = async (id: string) => {
		setBusy(id);
		const res = await commands.deleteModel(id);
		if (res.status === 'error') setError(res.error);
		setBusy(null);
		refresh();
	};

	const activate = async (id: string) => {
		setBusy(id);
		const res = await commands.setActiveModel(id);
		if (res.status === 'ok') setActiveId(id);
		else setError(res.error);
		setBusy(null);
	};

	return (
		<div className="flex max-w-2xl flex-col gap-6">
			{error && (
				<div
					className="rounded-md border px-4 py-2 text-caption"
					style={{
						borderColor: 'var(--color-border)',
						color: 'var(--color-danger, #e5484d)',
					}}>
					{error}
				</div>
			)}
			<SettingsCard title="Speech-to-Text Models">
				<div className="flex flex-col">
					{models.length === 0 && (
						<p className="px-6 py-5 text-sm" style={muted}>
							Loading models…
						</p>
					)}
					{models.map((m) => {
						const isActive = m.id === activeId;
						const pct = progress[m.id];
						const downloading = m.is_downloading || pct != null;
						return (
							<div
								key={m.id}
								className="flex items-center justify-between border-b px-6 py-5"
								style={{ borderColor: 'var(--color-border)' }}>
								<div className="flex flex-col gap-1.5">
									<span className="text-body">
										{m.name}
										{isActive && (
											<span
												className="ml-2 text-caption"
												style={{
													color: 'var(--color-toggle-on)',
												}}>
												● active
											</span>
										)}
									</span>
									<span className="text-caption" style={muted}>
										{m.engine_type} · {m.size_mb} MB ·{' '}
										{m.description}
									</span>
									{downloading && pct != null && (
										<span
											className="text-caption"
											style={muted}>
											Downloading… {pct.toFixed(0)}%
										</span>
									)}
								</div>
								<div className="flex gap-2">
									{m.is_downloaded ? (
										<>
											{!isActive && (
												<Btn
													label="Use"
													onClick={() =>
														activate(m.id)
													}
													disabled={busy === m.id}
												/>
											)}
											<Btn
												label="Delete"
												variant="danger"
												onClick={() => remove(m.id)}
												disabled={
													busy === m.id || isActive
												}
											/>
										</>
									) : downloading ? (
										<Btn
											label="Cancel"
											onClick={() =>
												commands
													.cancelDownload(m.id)
													.then(() => refresh())
											}
										/>
									) : (
										<Btn
											label="Download"
											onClick={() => download(m.id)}
											disabled={busy === m.id}
										/>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</SettingsCard>
		</div>
	);
}

function Btn({
	label,
	onClick,
	disabled,
	variant,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	variant?: 'danger';
}) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			className="rounded-md border px-3 py-1.5 text-caption transition-colors"
			style={{
				backgroundColor: 'var(--color-bg)',
				borderColor: 'var(--color-border)',
				color:
					variant === 'danger'
						? 'var(--color-danger, #e5484d)'
						: 'var(--color-text)',
				opacity: disabled ? 0.5 : 1,
				cursor: disabled ? 'not-allowed' : 'pointer',
			}}>
			{label}
		</button>
	);
}
