import { useEffect } from 'react';
import { useAppStore } from '../stores/app';
import { useSidecarStore } from '../stores/sidecarStore';
import { useModelsStore } from '../stores/models';

const POLL_MS = 15_000;

function Dot({ on }: { on: boolean }) {
	return (
		<span
			className="h-2 w-2 flex-shrink-0 rounded-full"
			style={{
				backgroundColor: on
					? 'var(--color-status-running, #6bcb77)'
					: 'var(--color-border)',
			}}
		/>
	);
}

export function EngineStatus({ collapsed }: { collapsed: boolean }) {
	const llmLoaded = useSidecarStore((s) => s.llmLoaded);
	const ttsLoaded = useSidecarStore((s) => s.ttsLoaded);
	const sttActiveId = useModelsStore((s) => s.sttActiveId);
	const setActiveView = useAppStore((s) => s.setActiveView);

	// Poll so a crashed sidecar goes gray instead of staying stale-green.
	useEffect(() => {
		const timer = setInterval(() => {
			void useSidecarStore.getState().refresh();
			void useModelsStore.getState().refresh();
		}, POLL_MS);
		return () => clearInterval(timer);
	}, []);

	const engines = [
		{ label: 'LLM', on: llmLoaded },
		{ label: 'TTS', on: ttsLoaded },
		{ label: 'STT', on: !!sttActiveId },
	];

	return (
		<button
			type="button"
			onClick={() => setActiveView('models')}
			title="Engine status — click to manage models"
			className={`sidebar-section flex cursor-pointer items-center gap-3 border-t transition-opacity hover:opacity-80 ${
				collapsed ? 'flex-col justify-center gap-1.5' : ''
			}`}
			style={{ borderColor: 'var(--color-border)' }}>
			{engines.map((e) => (
				<span key={e.label} className="flex items-center gap-1.5">
					<Dot on={e.on} />
					{!collapsed && (
						<span
							className="text-caption"
							style={{ color: 'var(--color-text-muted)' }}>
							{e.label}
						</span>
					)}
				</span>
			))}
		</button>
	);
}
