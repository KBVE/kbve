import { memo, useEffect } from 'react';
import { SettingsCard } from '../../SettingsCard';
import {
	commands,
	type LlmEngine,
	type OnichanModelInfo,
	type TtsEngine,
} from '@/bindings';
import { useSidecarStore } from '@/stores/sidecarStore';
import { useModelsStore, type ProgressEntry } from '@/stores/models';

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

function LoadedCard({
	title,
	loadedName,
	note,
	onUnload,
}: {
	title: string;
	loadedName: string | null;
	note?: string;
	onUnload: () => void;
}) {
	return (
		<SettingsCard title={title}>
			<div className="settings-row flex items-center justify-between gap-6 px-5 py-3">
				{loadedName ? (
					<>
						<span
							className="text-body"
							style={{ color: 'var(--color-toggle-on)' }}>
							● {loadedName}
						</span>
						<button
							onClick={() => onUnload()}
							className="btn btn-danger">
							Unload
						</button>
					</>
				) : (
					<span className="text-caption" style={muted}>
						{note ?? 'None'}
					</span>
				)}
			</div>
		</SettingsCard>
	);
}

interface ModelRowProps {
	id: string;
	name: string;
	description: string;
	sizeMb: number;
	installed: boolean;
	installedLabel?: string;
	isDownloading: boolean;
	partialSize: number;
	prog: ProgressEntry | undefined;
	busy: boolean;
	onLoad: (id: string) => void;
	onDownload: (id: string) => void;
	onDelete?: (id: string) => void;
	onCancel?: (id: string) => void;
	deleteDisabled?: boolean;
}

const ModelRow = memo(function ModelRow({
	id,
	name,
	description,
	sizeMb,
	installed,
	installedLabel = 'installed',
	isDownloading,
	partialSize,
	prog,
	busy,
	onLoad,
	onDownload,
	onDelete,
	onCancel,
	deleteDisabled = false,
}: ModelRowProps) {
	const downloading = isDownloading || prog != null;
	const sizeLabel =
		sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${sizeMb} MB`;
	const partialPct =
		!downloading && !installed && partialSize > 0 && sizeMb > 0
			? (partialSize / 1024 / 1024 / sizeMb) * 100
			: null;

	return (
		<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<span className="text-body">
					{name}
					{installed && (
						<span
							className="ml-2 text-caption"
							style={{ color: 'var(--color-toggle-on)' }}>
							● {installedLabel}
						</span>
					)}
				</span>
				<span className="text-caption" style={muted}>
					{sizeLabel} · {description}
				</span>
				{downloading && prog != null && (
					<DownloadBar pct={prog.pct} bps={prog.bps} />
				)}
				{partialPct != null && (
					<>
						<DownloadBar pct={partialPct} />
						<span className="text-caption" style={muted}>
							{(partialSize / 1024 / 1024 / 1024).toFixed(1)} GB
							downloaded — resume with Download
						</span>
					</>
				)}
			</div>
			<div className="flex gap-2">
				{installed ? (
					<>
						<button
							onClick={() => onLoad(id)}
							disabled={busy}
							className="btn">
							Load
						</button>
						{onDelete && (
							<button
								onClick={() => onDelete(id)}
								disabled={busy || deleteDisabled}
								className="btn btn-danger">
								Delete
							</button>
						)}
					</>
				) : downloading ? (
					onCancel ? (
						<button onClick={() => onCancel(id)} className="btn">
							Cancel
						</button>
					) : (
						<button disabled className="btn">
							Downloading…
						</button>
					)
				) : (
					<button
						onClick={() => onDownload(id)}
						disabled={busy}
						className="btn">
						{partialPct != null ? 'Resume' : 'Download'}
					</button>
				)}
			</div>
		</div>
	);
});

export type ModelSection = 'llm' | 'tts' | 'stt';

interface ModelEcosystemPanelProps {
	sections?: ModelSection[];
}

export function ModelEcosystemPanel({
	sections = ['llm', 'tts', 'stt'],
}: ModelEcosystemPanelProps) {
	const llmModels = useModelsStore((s) => s.llmModels);
	const ttsModels = useModelsStore((s) => s.ttsModels);
	const sttModels = useModelsStore((s) => s.sttModels);
	const sttActiveId = useModelsStore((s) => s.sttActiveId);
	const llmEngine = useModelsStore((s) => s.llmEngine);
	const loadedLlmName = useModelsStore((s) => s.loadedLlmName);
	const loadedTtsName = useModelsStore((s) => s.loadedTtsName);
	const progress = useModelsStore((s) => s.progress);
	const busy = useModelsStore((s) => s.busy);
	const error = useModelsStore((s) => s.error);
	const initModels = useModelsStore((s) => s.init);
	const changeLlmEngine = useModelsStore((s) => s.changeLlmEngine);
	const llmEndpoint = useModelsStore((s) => s.llmEndpoint);
	const changeLlmEndpoint = useModelsStore((s) => s.changeLlmEndpoint);
	const downloadOnichan = useModelsStore((s) => s.downloadOnichanModel);
	const cancelOnichan = useModelsStore((s) => s.cancelOnichanDownload);
	const deleteOnichan = useModelsStore((s) => s.deleteOnichanModel);
	const loadLlmRow = useModelsStore((s) => s.loadLlmModel);
	const loadTtsRow = useModelsStore((s) => s.loadTtsModel);
	const unloadLlmModel = useModelsStore((s) => s.unloadLlmModel);
	const unloadTtsModel = useModelsStore((s) => s.unloadTtsModel);
	const ttsEngine = useModelsStore((s) => s.ttsEngine);
	const changeTtsEngine = useModelsStore((s) => s.changeTtsEngine);
	const ttsEndpoint = useModelsStore((s) => s.ttsEndpoint);
	const changeTtsEndpoint = useModelsStore((s) => s.changeTtsEndpoint);
	const ttsHttpModel = useModelsStore((s) => s.ttsHttpModel);
	const ttsHttpVoice = useModelsStore((s) => s.ttsHttpVoice);
	const changeTtsHttpConfig = useModelsStore((s) => s.changeTtsHttpConfig);
	const downloadStt = useModelsStore((s) => s.downloadSttModel);
	const deleteStt = useModelsStore((s) => s.deleteSttModel);
	const activateStt = useModelsStore((s) => s.activateSttModel);
	const cancelStt = useModelsStore((s) => s.cancelSttDownload);
	const unloadStt = useModelsStore((s) => s.unloadSttModel);

	const llmLoaded = useSidecarStore((s) => s.llmLoaded);
	const ttsLoaded = useSidecarStore((s) => s.ttsLoaded);

	const wantsStt = sections.includes('stt');

	useEffect(() => {
		void initModels();
	}, [initModels]);

	const renderOnichanSection = (
		title: string,
		models: OnichanModelInfo[],
		loaded: boolean,
		loadedName: string | null,
		onLoad: (id: string) => void,
		onUnload: () => void,
	) => (
		<>
			<LoadedCard
				title={`${title} · Loaded`}
				loadedName={loaded ? loadedName : null}
				onUnload={onUnload}
			/>
			<SettingsCard title={`${title} Models`}>
				<div className="flex flex-col">
					{models.length === 0 && (
						<p className="px-5 py-4 text-caption" style={muted}>
							Loading…
						</p>
					)}
					{models.map((m) => (
						<ModelRow
							key={m.id}
							id={m.id}
							name={m.name}
							description={m.description}
							sizeMb={
								m.size_mb +
								(m.extra_parts?.reduce(
									(sum, p) => sum + p.size_mb,
									0,
								) ?? 0)
							}
							installed={m.is_downloaded}
							isDownloading={m.is_downloading}
							partialSize={m.partial_size}
							prog={progress[m.id]}
							busy={busy === m.id}
							onLoad={onLoad}
							onDownload={downloadOnichan}
							onDelete={deleteOnichan}
							onCancel={(id) => void cancelOnichan(id)}
						/>
					))}
				</div>
			</SettingsCard>
		</>
	);

	return (
		<>
			{error && <div className="alert-danger text-caption">{error}</div>}

			{sections.includes('llm') && (
				<SettingsCard title="LLM Engine">
					<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
						<div className="flex flex-col gap-1.5">
							<span className="text-body">
								Inference engine
								{llmLoaded && loadedLlmName ? (
									<span
										className="ml-2 text-caption"
										style={{
											color: 'var(--color-toggle-on)',
										}}>
										● {loadedLlmName} loaded
									</span>
								) : (
									<span
										className="ml-2 text-caption"
										style={muted}>
										no model loaded
									</span>
								)}
							</span>
							<span className="text-caption" style={muted}>
								{llmEngine === 'mistral_rs'
									? 'mistral.rs — pure-Rust engine (Metal)'
									: llmEngine === 'openai_compat'
										? 'External server (oMLX / rMLX / ollama / LM Studio) — serves MLX and other formats'
										: llmEngine === 'mlx'
											? 'Built-in rMLX server — native MLX models (mlx-community), fastest on Apple Silicon'
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
							<option value="mlx">MLX (built-in)</option>
							<option value="openai_compat">
								MLX / OpenAI server
							</option>
						</select>
					</div>
					{llmEngine === 'openai_compat' && (
						<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
							<div className="flex flex-col gap-1.5">
								<span className="text-body">Server URL</span>
								<span className="text-caption" style={muted}>
									OpenAI-compatible base URL. Run oMLX/rMLX
									with your MLX model and point here.
								</span>
							</div>
							<input
								className="control w-72 font-mono"
								defaultValue={llmEndpoint}
								spellCheck={false}
								onBlur={(e) => {
									const v = e.target.value.trim();
									if (v && v !== llmEndpoint)
										void changeLlmEndpoint(v);
								}}
							/>
						</div>
					)}
					<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
						<div className="flex flex-col gap-1.5">
							<span className="text-body">Sideload models</span>
							<span className="text-caption" style={muted}>
								Drop a .gguf file, or an MLX model folder
								(mlx-community), into the models folder and it
								appears below
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
					loadedLlmName,
					loadLlmRow,
					unloadLlmModel,
				)}

			{sections.includes('tts') && (
				<SettingsCard title="TTS Engine">
					<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
						<div className="flex flex-col gap-1.5">
							<span className="text-body">
								Synthesis engine
								{ttsLoaded && loadedTtsName ? (
									<span
										className="ml-2 text-caption"
										style={{
											color: 'var(--color-toggle-on)',
										}}>
										● {loadedTtsName} loaded
									</span>
								) : (
									<span
										className="ml-2 text-caption"
										style={muted}>
										no model loaded
									</span>
								)}
							</span>
							<span className="text-caption" style={muted}>
								{ttsEngine === 'openai_compat'
									? 'External server (mlx-audio) — Chatterbox Turbo and other MLX voices via /v1/audio/speech'
									: 'piper — default ONNX engine, fast built-in voices'}
							</span>
						</div>
						<select
							className="control"
							value={ttsEngine}
							onChange={(e) =>
								changeTtsEngine(e.target.value as TtsEngine)
							}>
							<option value="piper">piper (built-in)</option>
							<option value="openai_compat">
								MLX / OpenAI server
							</option>
						</select>
					</div>
					{ttsEngine === 'openai_compat' && (
						<>
							<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
								<div className="flex flex-col gap-1.5">
									<span className="text-body">
										Server URL
									</span>
									<span
										className="text-caption"
										style={muted}>
										Run: mlx_audio.server --port 8000, then
										point here
									</span>
								</div>
								<input
									className="control w-72 font-mono"
									defaultValue={ttsEndpoint}
									spellCheck={false}
									onBlur={(e) => {
										const v = e.target.value.trim();
										if (v && v !== ttsEndpoint)
											void changeTtsEndpoint(v);
									}}
								/>
							</div>
							<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
								<div className="flex flex-col gap-1.5">
									<span className="text-body">Model</span>
									<span
										className="text-caption"
										style={muted}>
										Hugging Face id — server downloads it on
										first request
									</span>
								</div>
								<input
									className="control w-72 font-mono"
									defaultValue={ttsHttpModel}
									spellCheck={false}
									onBlur={(e) => {
										const v = e.target.value.trim();
										if (v && v !== ttsHttpModel)
											void changeTtsHttpConfig(
												v,
												ttsHttpVoice,
											);
									}}
								/>
							</div>
							<div className="settings-row flex items-center justify-between gap-6 px-5 py-4">
								<div className="flex flex-col gap-1.5">
									<span className="text-body">Voice</span>
									<span
										className="text-caption"
										style={muted}>
										Optional voice name or reference; blank
										= model default
									</span>
								</div>
								<input
									className="control w-72 font-mono"
									defaultValue={ttsHttpVoice}
									spellCheck={false}
									placeholder="default"
									onBlur={(e) => {
										const v = e.target.value.trim();
										if (v !== ttsHttpVoice)
											void changeTtsHttpConfig(
												ttsHttpModel,
												v,
											);
									}}
								/>
							</div>
						</>
					)}
				</SettingsCard>
			)}

			{sections.includes('tts') &&
				renderOnichanSection(
					'Text-to-Speech (TTS)',
					ttsModels,
					ttsLoaded,
					loadedTtsName,
					loadTtsRow,
					unloadTtsModel,
				)}

			{wantsStt && (
				<>
					<LoadedCard
						title="Speech-to-Text (STT) · Loaded"
						loadedName={
							sttActiveId
								? (sttModels.find((m) => m.id === sttActiveId)
										?.name ?? sttActiveId)
								: null
						}
						onUnload={() => void unloadStt()}
					/>
					<SettingsCard title="Speech-to-Text (STT) Models">
						<div className="flex flex-col">
							{sttModels.length === 0 && (
								<p
									className="px-5 py-4 text-caption"
									style={muted}>
									Loading models…
								</p>
							)}
							{sttModels.map((m) => (
								<ModelRow
									key={m.id}
									id={m.id}
									name={m.name}
									description={`${m.engine_type} · ${m.description}`}
									sizeMb={m.size_mb}
									installed={m.is_downloaded}
									installedLabel={
										m.id === sttActiveId
											? 'active'
											: 'installed'
									}
									isDownloading={m.is_downloading}
									partialSize={m.partial_size ?? 0}
									prog={progress[m.id]}
									busy={busy === m.id}
									onLoad={(id) => void activateStt(id)}
									onDownload={(id) => void downloadStt(id)}
									onDelete={(id) => void deleteStt(id)}
									onCancel={(id) => void cancelStt(id)}
									deleteDisabled={m.id === sttActiveId}
								/>
							))}
						</div>
					</SettingsCard>
				</>
			)}
		</>
	);
}
