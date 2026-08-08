import { memo, useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SettingsCard } from '../../SettingsCard';
import {
	commands,
	type LlmEngine,
	type ModelInfo,
	type OnichanModelInfo,
} from '@/bindings';
import { useSidecarStore } from '@/stores/sidecarStore';

const muted = { color: 'var(--color-text-muted)' } as const;

function formatSpeed(bps: number): string {
	if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
	if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
	return `${bps} B/s`;
}

function DownloadBar({ pct, bps }: { pct: number; bps?: number }) {
	return (
		<div className="flex items-center gap-2">
			<div
				className="h-1.5 flex-1 overflow-hidden rounded-full"
				style={{ backgroundColor: 'var(--color-border)' }}>
				<div
					className="h-full rounded-full transition-[width] duration-300 ease-out"
					style={{
						width: `${Math.min(100, Math.max(0, pct))}%`,
						backgroundColor: 'var(--color-toggle-on)',
					}}
				/>
			</div>
			<span
				className="text-caption w-10 text-right tabular-nums"
				style={muted}>
				{pct.toFixed(0)}%
			</span>
			{bps != null && bps > 0 && (
				<span
					className="text-caption w-18 text-right tabular-nums"
					style={muted}>
					{formatSpeed(bps)}
				</span>
			)}
		</div>
	);
}

interface ProgressEntry {
	pct: number;
	bps: number;
}

interface OnichanModelRowProps {
	model: OnichanModelInfo;
	prog: ProgressEntry | undefined;
	busy: boolean;
	onLoad: (id: string) => void;
	onDownload: (id: string) => void;
}

const OnichanModelRow = memo(function OnichanModelRow({
	model: m,
	prog,
	busy,
	onLoad,
	onDownload,
}: OnichanModelRowProps) {
	const downloading = m.is_downloading || prog != null;
	const totalMb =
		m.size_mb +
		(m.extra_parts?.reduce((sum, p) => sum + p.size_mb, 0) ?? 0);
	const sizeLabel =
		totalMb >= 1024 ? `${(totalMb / 1024).toFixed(1)} GB` : `${totalMb} MB`;
	const partialPct =
		!downloading && !m.is_downloaded && m.partial_size > 0 && totalMb > 0
			? (m.partial_size / 1024 / 1024 / totalMb) * 100
			: null;

	return (
		<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<span className="text-body">
					{m.name}
					{m.is_downloaded && (
						<span
							className="ml-2 text-caption"
							style={{ color: 'var(--color-toggle-on)' }}>
							● installed
						</span>
					)}
				</span>
				<span className="text-caption" style={muted}>
					{sizeLabel} · {m.description}
				</span>
				{downloading && prog != null && (
					<DownloadBar pct={prog.pct} bps={prog.bps} />
				)}
				{partialPct != null && (
					<>
						<DownloadBar pct={partialPct} />
						<span className="text-caption" style={muted}>
							{(m.partial_size / 1024 / 1024 / 1024).toFixed(1)}{' '}
							GB downloaded — resume with Download
						</span>
					</>
				)}
			</div>
			<div className="flex gap-2">
				{m.is_downloaded ? (
					<button
						onClick={() => onLoad(m.id)}
						disabled={busy}
						className="btn">
						Load
					</button>
				) : (
					<button
						onClick={() => onDownload(m.id)}
						disabled={downloading || busy}
						className="btn">
						{partialPct != null ? 'Resume' : 'Download'}
					</button>
				)}
			</div>
		</div>
	);
});

export type ModelSection = 'llm' | 'tts' | 'stt';

interface DownloadProgress {
	model_id: string;
	percentage: number;
	speed_bps?: number;
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
	const [llmEngine, setLlmEngine] = useState<LlmEngine>('llama_cpp');
	const [sttActiveId, setSttActiveId] = useState('');
	const [progress, setProgress] = useState<Record<string, ProgressEntry>>({});
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
			if (sections.includes('llm')) {
				setLlmModels(await commands.getOnichanLlmModels());
				setLlmEngine(await commands.getLlmEngine());
			}
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
				[e.payload.model_id]: {
					pct: e.payload.percentage,
					bps: e.payload.speed_bps ?? 0,
				},
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

	const run = useCallback(
		async (id: string, fn: () => Promise<void>) => {
			setBusy(id);
			setError(null);
			try {
				await fn();
			} finally {
				setBusy(null);
			}
			void refresh();
		},
		[refresh],
	);

	const changeLlmEngine = async (engine: LlmEngine) => {
		setError(null);
		const res = await commands.setLlmEngine(engine);
		if (res.status === 'error') {
			setError(res.error);
			return;
		}
		setLlmEngine(engine);
		void refreshSidecar();
	};

	const downloadOnichan = useCallback(
		(id: string) =>
			void run(id, async () => {
				const res = await commands.downloadOnichanModel(id);
				if (res.status === 'error') setError(res.error);
			}),
		[run],
	);

	const loadLlmRow = useCallback(
		(id: string) => void run(id, () => storeLoadLlm(id)),
		[run, storeLoadLlm],
	);

	const loadTtsRow = useCallback(
		(id: string) => void run(id, () => storeLoadTts(id)),
		[run, storeLoadTts],
	);

	const renderOnichanSection = (
		title: string,
		models: OnichanModelInfo[],
		loaded: boolean,
		onLoad: (id: string) => void,
		onUnload: () => Promise<void>,
	) => (
		<SettingsCard title={`${title}${loaded ? ' · loaded' : ''}`}>
			<div className="flex flex-col">
				{models.length === 0 && (
					<p className="px-5 py-4 text-caption" style={muted}>
						Loading…
					</p>
				)}
				{models.map((m) => (
					<OnichanModelRow
						key={m.id}
						model={m}
						prog={progress[m.id]}
						busy={busy === m.id}
						onLoad={onLoad}
						onDownload={downloadOnichan}
					/>
				))}
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

			{sections.includes('llm') && (
				<SettingsCard title="LLM Engine">
					<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
						<div className="flex flex-col gap-1.5">
							<span className="text-body">Inference engine</span>
							<span className="text-caption" style={muted}>
								{llmEngine === 'mistral_rs'
									? 'mistral.rs — pure-Rust engine (Metal)'
									: 'llama.cpp — default engine (Metal)'}
								{'. Switching reloads the model on next use.'}
							</span>
						</div>
						<select
							className="control"
							value={llmEngine}
							onChange={(e) =>
								changeLlmEngine(e.target.value as LlmEngine)
							}>
							<option value="llama_cpp">llama.cpp</option>
							<option value="mistral_rs">mistral.rs</option>
						</select>
					</div>
					<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
						<div className="flex flex-col gap-1.5">
							<span className="text-body">Sideload models</span>
							<span className="text-caption" style={muted}>
								Drop any .gguf into the models folder and it
								appears in the list below (first part only for
								split downloads)
							</span>
						</div>
						<button
							className="btn"
							onClick={() =>
								void commands.openOnichanModelsDir()
							}>
							Open models folder
						</button>
					</div>
				</SettingsCard>
			)}

			{sections.includes('llm') &&
				renderOnichanSection(
					'Language Model (LLM)',
					llmModels,
					llmLoaded,
					loadLlmRow,
					unloadLlm,
				)}

			{sections.includes('tts') &&
				renderOnichanSection(
					'Text-to-Speech (TTS)',
					ttsModels,
					ttsLoaded,
					loadTtsRow,
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
							const prog = progress[m.id];
							const downloading =
								m.is_downloading || prog != null;
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
										{downloading && prog != null && (
											<DownloadBar
												pct={prog.pct}
												bps={prog.bps}
											/>
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
