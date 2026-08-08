import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { commands } from '../bindings';
import { useAppStore } from '../stores/app';
import { useSidecarStore } from '../stores/sidecarStore';

const muted = { color: 'var(--color-text-muted)' } as const;

export function OnichanSettings() {
	const [active, setActive] = useState(false);
	const [conversing, setConversing] = useState(false);
	const [chat, setChat] = useState('');
	const [reply, setReply] = useState('');
	const [error, setError] = useState<string | null>(null);
	const busyRef = useRef(false);
	const llmLoaded = useSidecarStore((s) => s.llmLoaded);
	const ttsLoaded = useSidecarStore((s) => s.ttsLoaded);
	const setActiveView = useAppStore((s) => s.setActiveView);

	const refresh = useCallback(async () => {
		const a = await commands.onichanIsActive();
		setActive(a);
		setConversing(await commands.onichanIsConversationRunning());
	}, []);

	useEffect(() => {
		void (async () => {
			await refresh();
		})();
	}, [refresh]);

	useEffect(() => {
		const resp = listen<{ text: string }>('onichan-response', (e) =>
			setReply(e.payload.text),
		);
		return () => {
			resp.then((f) => f());
		};
	}, []);

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
		<>
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
		</>
	);
}
