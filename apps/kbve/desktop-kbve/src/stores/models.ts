import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
	commands,
	type LlmEngine,
	type ModelInfo,
	type OnichanModelInfo,
	type TtsEngine,
} from '@/bindings';
import { useSidecarStore } from './sidecarStore';

export interface ProgressEntry {
	pct: number;
	bps: number;
}

interface DownloadProgressEvent {
	model_id: string;
	percentage: number;
	speed_bps?: number;
}

interface ModelsStore {
	llmModels: OnichanModelInfo[];
	ttsModels: OnichanModelInfo[];
	sttModels: ModelInfo[];
	sttActiveId: string;
	llmEngine: LlmEngine;
	llmEndpoint: string;
	ttsEngine: TtsEngine;
	ttsEndpoint: string;
	ttsHttpModel: string;
	ttsHttpVoice: string;
	loadedLlmName: string | null;
	loadedTtsName: string | null;
	sttLoaded: boolean;
	loadedSttName: string | null;
	progress: Record<string, ProgressEntry>;
	busy: string | null;
	error: string | null;

	/** Register tauri event listeners once per app lifetime. */
	init: () => Promise<void>;
	refresh: () => Promise<void>;
	setError: (error: string | null) => void;

	changeLlmEngine: (engine: LlmEngine) => Promise<void>;
	changeLlmEndpoint: (url: string) => Promise<void>;
	changeTtsEngine: (engine: TtsEngine) => Promise<void>;
	changeTtsEndpoint: (url: string) => Promise<void>;
	changeTtsHttpConfig: (model: string, voice: string) => Promise<void>;
	downloadOnichanModel: (id: string) => Promise<void>;
	loadLlmModel: (id: string) => Promise<void>;
	loadTtsModel: (id: string) => Promise<void>;
	unloadLlmModel: () => Promise<void>;
	unloadTtsModel: () => Promise<void>;
	deleteOnichanModel: (id: string) => Promise<void>;
	downloadSttModel: (id: string) => Promise<void>;
	deleteSttModel: (id: string) => Promise<void>;
	activateSttModel: (id: string) => Promise<void>;
	unloadSttModel: () => Promise<void>;
	cancelSttDownload: (id: string) => Promise<void>;
	cancelOnichanDownload: (id: string) => Promise<void>;
}

let listenersRegistered = false;
let listenerHandles: Promise<UnlistenFn>[] = [];

export const useModelsStore = create<ModelsStore>((set, get) => {
	const run = async (id: string, fn: () => Promise<void>) => {
		set({ busy: id, error: null });
		try {
			await fn();
		} finally {
			set({ busy: null });
		}
		void get().refresh();
	};

	return {
		llmModels: [],
		ttsModels: [],
		sttModels: [],
		sttActiveId: '',
		llmEngine: 'llama_cpp',
		llmEndpoint: 'http://localhost:8000/v1',
		ttsEngine: 'piper',
		ttsEndpoint: 'http://localhost:8000/v1',
		ttsHttpModel: 'mlx-community/chatterbox-turbo-fp16',
		ttsHttpVoice: '',
		loadedLlmName: null,
		loadedTtsName: null,
		sttLoaded: false,
		loadedSttName: null,
		progress: {},
		busy: null,
		error: null,

		init: async () => {
			if (listenersRegistered) return;
			listenersRegistered = true;

			const onProgress = (e: { payload: DownloadProgressEvent }) =>
				set((s) => ({
					progress: {
						...s.progress,
						[e.payload.model_id]: {
							pct: e.payload.percentage,
							bps: e.payload.speed_bps ?? 0,
						},
					},
				}));
			const onDone = () => {
				set({ progress: {} });
				void get().refresh();
				void useSidecarStore.getState().refresh();
			};

			listenerHandles = [
				listen<DownloadProgressEvent>(
					'onichan-model-download-progress',
					onProgress,
				),
				listen('onichan-model-download-complete', onDone),
				listen<DownloadProgressEvent>(
					'model-download-progress',
					onProgress,
				),
				listen('model-download-complete', onDone),
			];
			await Promise.all(listenerHandles);
			await get().refresh();
		},

		refresh: async () => {
			const [
				llmModels,
				llmEngine,
				llmEndpoint,
				loadedLlmNameRes,
				ttsModels,
				loadedTtsName,
				ttsEngine,
				ttsEndpoint,
				ttsHttpConfig,
			] = await Promise.all([
				commands.getOnichanLlmModels(),
				commands.getLlmEngine(),
				commands.getLlmEndpoint(),
				commands.getLocalLlmModelName(),
				commands.getOnichanTtsModels(),
				commands.getLocalTtsModelName(),
				commands.getTtsEngine(),
				commands.getTtsEndpoint(),
				commands.getTtsHttpConfig(),
			]);
			const loadedLlmName =
				loadedLlmNameRes.status === 'ok' ? loadedLlmNameRes.data : null;
			set({
				llmModels,
				llmEngine,
				llmEndpoint,
				loadedLlmName,
				ttsModels,
				loadedTtsName,
				ttsEngine,
				ttsEndpoint,
				ttsHttpModel: ttsHttpConfig.model,
				ttsHttpVoice: ttsHttpConfig.voice,
			});

			const list = await commands.getAvailableModels();
			if (list.status === 'ok') set({ sttModels: list.data });
			const current = await commands.getCurrentModel();
			if (current.status === 'ok') set({ sttActiveId: current.data });
			const sttStatus = await commands.getModelLoadStatus();
			if (sttStatus.status === 'ok') {
				set({
					sttLoaded: sttStatus.data.is_loaded,
					loadedSttName: sttStatus.data.current_model ?? null,
				});
			}
		},

		setError: (error) => set({ error }),

		changeLlmEngine: async (engine) => {
			set({ error: null });
			const res = await commands.setLlmEngine(engine);
			if (res.status === 'error') {
				set({ error: res.error });
				return;
			}
			set({ llmEngine: engine });
			void useSidecarStore.getState().refresh();
		},

		changeLlmEndpoint: async (url) => {
			const res = await commands.setLlmEndpoint(url);
			if (res.status === 'error') {
				set({ error: res.error });
				return;
			}
			set({ llmEndpoint: url });
			void get().refresh();
		},

		changeTtsEngine: async (engine) => {
			set({ error: null });
			const res = await commands.setTtsEngine(engine);
			if (res.status === 'error') {
				set({ error: res.error });
				return;
			}
			set({ ttsEngine: engine });
			void get().refresh();
			void useSidecarStore.getState().refresh();
		},

		changeTtsEndpoint: async (url) => {
			const res = await commands.setTtsEndpoint(url);
			if (res.status === 'error') {
				set({ error: res.error });
				return;
			}
			set({ ttsEndpoint: url });
			void get().refresh();
		},

		changeTtsHttpConfig: async (model, voice) => {
			const res = await commands.setTtsHttpConfig({ model, voice });
			if (res.status === 'error') {
				set({ error: res.error });
				return;
			}
			set({ ttsHttpModel: model, ttsHttpVoice: voice });
			void get().refresh();
		},

		downloadOnichanModel: (id) =>
			run(id, async () => {
				const res = await commands.downloadOnichanModel(id);
				if (res.status === 'error') {
					set((s) => {
						const progress = { ...s.progress };
						delete progress[id];
						return { error: res.error, progress };
					});
				}
			}),

		loadLlmModel: (id) =>
			run(id, () => useSidecarStore.getState().loadLlm(id)),

		loadTtsModel: (id) =>
			run(id, () => useSidecarStore.getState().loadTts(id)),

		unloadLlmModel: () =>
			run('unload', () => useSidecarStore.getState().unloadLlm()),

		unloadTtsModel: () =>
			run('unload', () => useSidecarStore.getState().unloadTts()),

		deleteOnichanModel: (id) =>
			run(id, async () => {
				const res = await commands.deleteOnichanModel(id);
				if (res.status === 'error') set({ error: res.error });
			}),

		downloadSttModel: (id) =>
			run(id, async () => {
				const res = await commands.downloadModel(id);
				if (res.status === 'error') {
					set((s) => {
						const progress = { ...s.progress };
						delete progress[id];
						return { error: res.error, progress };
					});
				}
			}),

		deleteSttModel: (id) =>
			run(id, async () => {
				const res = await commands.deleteModel(id);
				if (res.status === 'error') set({ error: res.error });
			}),

		activateSttModel: (id) =>
			run(id, async () => {
				const res = await commands.setActiveModel(id);
				if (res.status === 'ok') set({ sttActiveId: id });
				else set({ error: res.error });
			}),

		unloadSttModel: () =>
			run('unload', async () => {
				const res = await commands.unloadModelManually();
				if (res.status === 'error') set({ error: res.error });
			}),

		cancelSttDownload: async (id) => {
			await commands.cancelDownload(id);
			void get().refresh();
		},

		cancelOnichanDownload: async (id) => {
			await commands.cancelOnichanDownload(id);
		},
	};
});
