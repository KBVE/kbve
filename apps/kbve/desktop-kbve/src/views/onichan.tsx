import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { commands } from '../bindings';
import { useAppStore } from '../stores/app';
import { useSidecarStore } from '../stores/sidecarStore';
interface FeedMessage {
	role: string;
	content: string;
	speaker?: string;
	skipped?: boolean;
}

const muted = { color: 'var(--color-text-muted)' } as const;

export function OnichanSettings() {
	const [conversing, setConversing] = useState(false);
	const [conversationPhase, setConversationPhase] =
		useState<string>('stopped');
	const [transcript, setTranscript] = useState<FeedMessage[]>([]);
	const [chat, setChat] = useState('');
	const [error, setError] = useState<string | null>(null);
	const busyRef = useRef(false);
	const llmLoaded = useSidecarStore((s) => s.llmLoaded);
	const ttsLoaded = useSidecarStore((s) => s.ttsLoaded);
	const setActiveView = useAppStore((s) => s.setActiveView);

	const refresh = useCallback(async () => {
		setConversing(await commands.onichanIsConversationRunning());
		setTranscript(await commands.onichanGetHistory());
	}, []);

	useEffect(() => {
		void (async () => {
			await refresh();
		})();
	}, [refresh]);

	useEffect(() => {
		const resp = listen<{ text: string }>('onichan-response', (e) => {
			setTranscript((prev) => [
				...prev,
				{ role: 'assistant', content: e.payload.text },
			]);
		});
		const speech = listen<string>('onichan-user-speech', (e) =>
			setTranscript((prev) => [
				...prev,
				{ role: 'user', content: e.payload },
			]),
		);
		const phase = listen<string>('onichan-conversation-state', (e) =>
			setConversationPhase(e.payload),
		);
		const discordSpeech = listen<{
			user_id: string;
			text: string;
			skipped: boolean;
		}>('discord-user-speech', (e) =>
			setTranscript((prev) => [
				...prev,
				{
					role: 'user',
					content: e.payload.text,
					speaker: `Discord ${e.payload.user_id.slice(-4)}`,
					skipped: e.payload.skipped,
				},
			]),
		);
		const discordPhase = listen<string>('discord-conversation-state', (e) =>
			setConversationPhase(`discord ${e.payload}`),
		);
		return () => {
			resp.then((f) => f());
			speech.then((f) => f());
			phase.then((f) => f());
			discordSpeech.then((f) => f());
			discordPhase.then((f) => f());
		};
	}, []);

	const send = async () => {
		if (!chat.trim() || busyRef.current) return;
		busyRef.current = true;
		setError(null);
		setTranscript((prev) => [...prev, { role: 'user', content: chat }]);
		const res = await commands.onichanProcessInput(chat);
		if (res.status === 'ok') {
			if (ttsLoaded) commands.onichanSpeak(res.data);
		} else setError(res.error);
		setChat('');
		busyRef.current = false;
	};

	return (
		<>
			{error && <div className="alert-danger text-caption">{error}</div>}

			<SettingsCard title="Onichan Assistant">
				<SettingsRow
					label="Continuous conversation"
					description="Hands-free loop for THIS computer's microphone. For Discord voice, use Conversation Mode in the Discord section above">
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
				<SettingsRow
					label="Models"
					description={`LLM ${llmLoaded ? 'loaded' : 'not loaded'} · TTS ${
						ttsLoaded ? 'loaded' : 'not loaded'
					} — download and load in the Models view`}>
					<button
						onClick={() => setActiveView('models')}
						className="btn">
						Manage models
					</button>
				</SettingsRow>
			</SettingsCard>

			<SettingsCard title="Conversation">
				<div className="flex flex-col gap-3 px-5 py-4">
					<div className="flex items-center gap-2">
						<span
							className="h-2 w-2 rounded-full"
							style={{
								backgroundColor: conversing
									? 'var(--color-toggle-on)'
									: 'var(--color-border)',
							}}
						/>
						<span className="text-caption" style={muted}>
							{conversing
								? `Conversation mode: ${conversationPhase}`
								: 'Conversation mode off — toggle above for hands-free voice'}
						</span>
					</div>

					<div
						className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg p-3"
						style={{ backgroundColor: 'var(--color-bg)' }}>
						{transcript.length === 0 && (
							<p className="text-caption" style={muted}>
								Nothing yet — speak (conversation mode) or type
								below and the exchange shows up here.
							</p>
						)}
						{transcript.map((m, i) => (
							<div
								key={i}
								className="flex flex-col gap-0.5"
								style={{
									alignItems:
										m.role === 'user'
											? 'flex-end'
											: 'flex-start',
								}}>
								<span className="text-caption" style={muted}>
									{m.role === 'user' ? 'You' : 'Onichan'}
								</span>
								<p
									className="text-body max-w-[85%] rounded-lg px-3 py-1.5"
									style={{
										backgroundColor:
											m.role === 'user'
												? 'var(--color-accent)'
												: 'var(--color-surface)',
										color:
											m.role === 'user'
												? 'var(--color-bg)'
												: 'var(--color-text)',
										opacity: m.skipped ? 0.55 : 1,
									}}>
									{m.content}
								</p>
							</div>
						))}
					</div>

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
							disabled={!llmLoaded}
							className="control flex-1"
						/>
						<button
							onClick={send}
							disabled={!llmLoaded}
							className="btn">
							Send
						</button>
					</div>
				</div>
			</SettingsCard>
		</>
	);
}
