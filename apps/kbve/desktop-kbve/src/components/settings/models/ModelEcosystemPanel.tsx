import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SettingsCard } from '../../SettingsCard';
import { commands, type ModelInfo, type OnichanModelInfo } from '@/bindings';
import { useSidecarStore } from '@/stores/sidecarStore';

const muted = { color: 'var(--color-text-muted)' } as const;

export type ModelSection = 'llm' | 'tts' | 'stt';

interface DownloadProgress {
	model_id: string;
	percentage: number;
}

interface ModelEcosystemPanelProps {
	sections?: ModelSection[];
}

export function ModelEcosystemPanel({
	sections = ['llm', 'tts', 'stt'],
}: ModelEcosystemPanelProps) {
	const [llmModels, setLlmModels] = useState<OnichanModelInfo[]>([]);
	const [ttsModels, setTtsModels] = useState<OnichanModelInfo[]>([]);
	const [sttModels, setSttModels] = useState<ModelInfo[]>([]);
	const [sttActiveId, setSttActiveId] = useState('');
	const [progress, setProgress] = useState<Record<string, number>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const llmLoaded = useSidecarStore((s) => s.llmLoaded);
	const ttsLoaded = useSidecarStore((s) => s.ttsLoaded);
	const refreshSidecar = useSidecarStore((s) => s.refresh);
	const storeLoadLlm = useSidecarStore((s) => s.loadLlm);
	const storeLoadTts = useSidecarStore((s) => s.loadTts);
	const unloadLlm = useSidecarStore((s) => s.unloadLlm);
	const unloadTts = useSidecarStore((s) => s.unloadTts);

	const wantsOnichan = sections.includes('llm') || sections.includes('tts');
	const wantsStt = sections.includes('stt');

	const refresh = useCallback(async () => {
		if (wantsOnichan) {
			if (sections.includes('llm'))
				setLlmModels(await commands.getOnichanLlmModels());
			if (sections.includes('tts'))
				setTtsModels(await commands.getOnichanTtsModels());
		}
		if (wantsStt) {
			const list = await commands.getAvailableModels();
			if (list.status === 'ok') setSttModels(list.data);
			const current = await commands.getCurrentModel();
			if (current.status === 'ok') setSttActiveId(current.data);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [wantsOnichan, wantsStt, sections.join(',')]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		const unlisteners: Promise<() => void>[] = [];
		const onProgress = (e: { payload: DownloadProgress }) =>
			setProgress((prev) => ({
				...prev,
				[e.payload.model_id]: e.payload.percentage,
			}));
		const onDone = () => {
			setProgress({});
			void refresh();
			void refreshSidecar();
		};
		if (wantsOnichan) {
			unlisteners.push(
				listen<DownloadProgress>(
					'onichan-model-download-progress',
					onProgress,
				),
				listen('onichan-model-download-complete', onDone),
			);
		}
		if (wantsStt) {
			unlisteners.push(
				listen<DownloadProgress>('model-download-progress', onProgress),
				listen('model-download-complete', onDone),
			);
		}
		return () => {
			unlisteners.forEach((u) => u.then((f) => f()));
		};
	}, [wantsOnichan, wantsStt, refresh, refreshSidecar]);

	const run = async (id: string, fn: () => Promise<void>) => {
		setBusy(id);
		setError(null);
		try {
			await fn();
		} finally {
			setBusy(null);
		}
		void refresh();
	};

	const downloadOnichan = (id: string) =>
		run(id, async () => {
			const res = await commands.downloadOnichanModel(id);
			if (res.status === 'error') setError(res.error);
		});

	const renderOnichanSection = (
		title: string,
		models: OnichanModelInfo[],
		loaded: boolean,
		onLoad: (id: string) => Promise<void>,
		onUnload: () => Promise<void>,
	) => (
		<SettingsCard title={`${title}${loaded ? ' · loaded' : ''}`}>
			<div className="flex flex-col">
				{models.length === 0 && (
					<p className="px-5 py-4 text-caption" style={muted}>
						Loading…
					</p>
				)}
				{models.map((m) => {
					const pct = progress[m.id];
					const downloading = m.is_downloading || pct != null;
					return (
						<div
							key={m.id}
							className="settings-row flex items-center justify-between gap-6 px-5 py-4">
							<div className="flex flex-col gap-1.5">
								<span className="text-body">{m.name}</span>
								<span className="text-caption" style={muted}>
									{m.size_mb} MB · {m.description}
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
									<button
										onClick={() =>
											run(m.id, () => onLoad(m.id))
										}
										disabled={busy === m.id}
										className="btn">
										Load
									</button>
								) : (
									<button
										onClick={() => downloadOnichan(m.id)}
										disabled={downloading || busy === m.id}
										className="btn">
										Download
									</button>
								)}
							</div>
						</div>
					);
				})}
				{loaded && (
					<div className="settings-row flex items-center justify-end px-5 py-3">
						<button
							onClick={() => run('unload', onUnload)}
							className="btn btn-danger">
							Unload
						</button>
					</div>
				)}
			</div>
		</SettingsCard>
	);

	return (
		<>
			{error && <div className="alert-danger text-caption">{error}</div>}

			{sections.includes('llm') &&
				renderOnichanSection(
					'Language Model (LLM)',
					llmModels,
					llmLoaded,
					storeLoadLlm,
					unloadLlm,
				)}

			{sections.includes('tts') &&
				renderOnichanSection(
					'Text-to-Speech (TTS)',
					ttsModels,
					ttsLoaded,
					storeLoadTts,
					unloadTts,
				)}

			{wantsStt && (
				<SettingsCard title="Speech-to-Text (STT)">
					<div className="flex flex-col">
						{sttModels.length === 0 && (
							<p className="px-5 py-4 text-caption" style={muted}>
								Loading models…
							</p>
						)}
						{sttModels.map((m) => {
							const isActive = m.id === sttActiveId;
							const pct = progress[m.id];
							const downloading = m.is_downloading || pct != null;
							return (
								<div
									key={m.id}
									className="settings-row flex items-center justify-between gap-6 px-5 py-4">
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
										<span
											className="text-caption"
											style={muted}>
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
													<button
														onClick={() =>
															run(
																m.id,
																async () => {
																	const res =
																		await commands.setActiveModel(
																			m.id,
																		);
																	if (
																		res.status ===
																		'ok'
																	)
																		setSttActiveId(
																			m.id,
																		);
																	else
																		setError(
																			res.error,
																		);
																},
															)
														}
														disabled={busy === m.id}
														className="btn">
														Use
													</button>
												)}
												<button
													onClick={() =>
														run(m.id, async () => {
															const res =
																await commands.deleteModel(
																	m.id,
																);
															if (
																res.status ===
																'error'
															)
																setError(
																	res.error,
																);
														})
													}
													disabled={
														busy === m.id ||
														isActive
													}
													className="btn btn-danger">
													Delete
												</button>
											</>
										) : downloading ? (
											<button
												onClick={() =>
													commands
														.cancelDownload(m.id)
														.then(() => refresh())
												}
												className="btn">
												Cancel
											</button>
										) : (
											<button
												onClick={() =>
													run(m.id, async () => {
														const res =
															await commands.downloadModel(
																m.id,
															);
														if (
															res.status ===
															'error'
														)
															setError(res.error);
													})
												}
												disabled={busy === m.id}
												className="btn">
												Download
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</SettingsCard>
			)}
		</>
	);
}
