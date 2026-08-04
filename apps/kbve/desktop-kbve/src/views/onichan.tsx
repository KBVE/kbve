import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { commands, type OnichanModelInfo } from '../bindings';

const muted = { color: 'var(--color-text-muted)' } as const;

interface OnichanProgress {
	model_id: string;
	percentage: number;
}

export function OnichanView() {
	const [active, setActive] = useState(false);
	const [llm, setLlm] = useState<OnichanModelInfo[]>([]);
	const [tts, setTts] = useState<OnichanModelInfo[]>([]);
	const [llmLoaded, setLlmLoaded] = useState(false);
	const [ttsLoaded, setTtsLoaded] = useState(false);
	const [conversing, setConversing] = useState(false);
	const [progress, setProgress] = useState<Record<string, number>>({});
	const [chat, setChat] = useState('');
	const [reply, setReply] = useState('');
	const [error, setError] = useState<string | null>(null);
	const busyRef = useRef(false);

	const refresh = useCallback(async () => {
		const a = await commands.onichanIsActive();
		setActive(a);
		setLlm(await commands.getOnichanLlmModels());
		setTts(await commands.getOnichanTtsModels());
		setLlmLoaded(await commands.isLocalLlmLoaded());
		setTtsLoaded(await commands.isLocalTtsLoaded());
		setConversing(await commands.onichanIsConversationRunning());
	}, []);

	useEffect(() => {
		void (async () => {
			await refresh();
		})();
	}, [refresh]);

	useEffect(() => {
		const p = listen<OnichanProgress>(
			'onichan-model-download-progress',
			(e) =>
				setProgress((prev) => ({
					...prev,
					[e.payload.model_id]: e.payload.percentage,
				})),
		);
		const done = listen('onichan-model-download-complete', () => {
			setProgress({});
			refresh();
		});
		const resp = listen<{ text: string }>('onichan-response', (e) =>
			setReply(e.payload.text),
		);
		return () => {
			p.then((f) => f());
			done.then((f) => f());
			resp.then((f) => f());
		};
	}, [refresh]);

	const download = async (id: string) => {
		const res = await commands.downloadOnichanModel(id);
		if (res.status === 'error') setError(res.error);
		refresh();
	};

	const loadLlm = async (id: string) => {
		const res = await commands.loadLocalLlm(id);
		if (res.status === 'error') setError(res.error);
		else setLlmLoaded(true);
	};

	const loadTts = async (id: string) => {
		const res = await commands.loadLocalTts(id);
		if (res.status === 'error') setError(res.error);
		else setTtsLoaded(true);
	};

	const send = async () => {
		if (!chat.trim() || busyRef.current) return;
		busyRef.current = true;
		setError(null);
		const res = await commands.onichanProcessInput(chat);
		if (res.status === 'ok') {
			setReply(res.data);
			if (ttsLoaded) commands.onichanSpeak(res.data);
		} else setError(res.error);
		setChat('');
		busyRef.current = false;
	};

	return (
		<div className="view-column">
			{error && <div className="alert-danger text-caption">{error}</div>}

			<SettingsCard title="Onichan Assistant">
				<SettingsRow
					label="Enabled"
					description="Turn the local voice assistant on or off">
					<ToggleSwitch
						checked={active}
						onChange={async (v) => {
							if (v) await commands.onichanEnable();
							else await commands.onichanDisable();
							setActive(v);
						}}
					/>
				</SettingsRow>
				<SettingsRow
					label="Continuous conversation"
					description="Listen and respond hands-free (requires LLM + TTS loaded)">
					<ToggleSwitch
						checked={conversing}
						onChange={async (v) => {
							if (v) {
								const r =
									await commands.onichanStartConversation();
								if (r.status === 'error') {
									setError(r.error);
									return;
								}
							} else await commands.onichanStopConversation();
							setConversing(v);
						}}
					/>
				</SettingsRow>
			</SettingsCard>

			<ModelCard
				title={`Language Model${llmLoaded ? ' · loaded' : ''}`}
				models={llm}
				progress={progress}
				onDownload={download}
				onLoad={loadLlm}
			/>
			<ModelCard
				title={`Voice (TTS)${ttsLoaded ? ' · loaded' : ''}`}
				models={tts}
				progress={progress}
				onDownload={download}
				onLoad={loadTts}
			/>

			<SettingsCard title="Chat">
				<div className="flex flex-col gap-3 px-5 py-4">
					<div className="flex gap-2">
						<input
							value={chat}
							onChange={(e) => setChat(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && send()}
							placeholder={
								llmLoaded
									? 'Type a message…'
									: 'Load a language model first'
							}
							disabled={!llmLoaded || !active}
							className="control flex-1"
						/>
						<button
							onClick={send}
							disabled={!llmLoaded || !active}
							className="btn">
							Send
						</button>
					</div>
					{reply && (
						<p className="text-body" style={muted}>
							{reply}
						</p>
					)}
				</div>
			</SettingsCard>
		</div>
	);
}

function ModelCard({
	title,
	models,
	progress,
	onDownload,
	onLoad,
}: {
	title: string;
	models: OnichanModelInfo[];
	progress: Record<string, number>;
	onDownload: (id: string) => void;
	onLoad: (id: string) => void;
}) {
	return (
		<SettingsCard title={title}>
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
										onClick={() => onLoad(m.id)}
										className="btn">
										Load
									</button>
								) : (
									<button
										onClick={() => onDownload(m.id)}
										disabled={downloading}
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
	);
}
