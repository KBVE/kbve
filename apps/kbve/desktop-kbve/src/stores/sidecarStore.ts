import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { commands } from '@/bindings';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface DiscordState {
	connected: boolean;
	in_voice: boolean;
	listening: boolean;
	guild_name: string | null;
	channel_name: string | null;
	error: string | null;
}

export interface OnichanState {
	active: boolean;
	mode: string;
	local_llm_loaded: boolean;
	local_tts_loaded: boolean;
}

export interface MemoryState {
	is_running: boolean;
	model_loaded: boolean;
	total_memories: number;
}

interface SidecarStore {
	// LLM state
	llmLoaded: boolean;
	llmModelName: string | null;
	llmLoading: boolean;

	// TTS state
	ttsLoaded: boolean;
	ttsLoading: boolean;

	// Discord state
	discordConnected: boolean;
	discordInVoice: boolean;
	discordGuild: string | null;
	discordChannel: string | null;
	discordConversationRunning: boolean;
	discordLoading: boolean;

	// Onichan state
	onichanActive: boolean;
	onichanMode: string;
	onichanConversationRunning: boolean;

	// Memory sidecar state
	memoryRunning: boolean;
	memoryModelLoaded: boolean;
	memoryModelId: string | null;
	memoryCount: number;
	memoryLoading: boolean;

	// Last-used quick-start config
	lastLlmModelId: string | null;
	lastTtsModelId: string | null;
	lastDiscordGuildId: string | null;
	lastDiscordChannelId: string | null;
	lastDiscordGuildName: string | null;
	lastDiscordChannelName: string | null;
	lastEmbeddingModelId: string | null;
	discordQuickConnect: boolean;
	discordAutoConversation: boolean;
	quickConfigLoaded: boolean;

	// Actions
	initialize: () => Promise<void>;
	refresh: () => Promise<void>;
	cleanup: () => void;

	// Quick-config actions
	loadQuickConfig: () => Promise<void>;
	saveQuickConfigField: (key: string, value: string | null) => Promise<void>;
	setDiscordQuickConnect: (enabled: boolean) => Promise<void>;
	setDiscordAutoConversation: (enabled: boolean) => Promise<void>;

	// LLM actions
	loadLlm: (modelId: string) => Promise<void>;
	unloadLlm: () => Promise<void>;
	setLlmLoading: (loading: boolean) => void;
	quickStartLlm: () => Promise<void>;

	// TTS actions
	loadTts: (modelId: string) => Promise<void>;
	unloadTts: () => Promise<void>;
	setTtsLoading: (loading: boolean) => void;
	quickStartTts: () => Promise<void>;

	// Discord actions
	updateDiscordState: (state: Partial<DiscordState>) => void;
	setDiscordConversationRunning: (running: boolean) => void;
	connectDiscordVoice: (
		guildId: string,
		channelId: string,
		guildName: string,
		channelName: string,
	) => Promise<string | null>;
	quickStartDiscord: () => Promise<void>;
	quickStopDiscord: () => Promise<void>;

	// Onichan actions
	updateOnichanState: (state: Partial<OnichanState>) => void;
	setOnichanConversationRunning: (running: boolean) => void;

	// Memory actions
	updateMemoryState: (state: Partial<MemoryState>) => void;
	quickStartMemory: () => Promise<void>;
	quickStopMemory: () => Promise<void>;

	// Internal
	_unlisteners: UnlistenFn[];
	_setUnlisteners: (unlisteners: UnlistenFn[]) => void;
}

export const useSidecarStore = create<SidecarStore>()(
	subscribeWithSelector((set, get) => ({
		// Initial state
		llmLoaded: false,
		llmModelName: null,
		llmLoading: false,

		ttsLoaded: false,
		ttsLoading: false,

		discordConnected: false,
		discordInVoice: false,
		discordGuild: null,
		discordChannel: null,
		discordConversationRunning: false,
		discordLoading: false,

		onichanActive: false,
		onichanMode: 'local',
		onichanConversationRunning: false,

		memoryRunning: false,
		memoryModelLoaded: false,
		memoryModelId: null,
		memoryCount: 0,
		memoryLoading: false,

		// Quick-config defaults
		lastLlmModelId: null,
		lastTtsModelId: null,
		lastDiscordGuildId: null,
		lastDiscordChannelId: null,
		lastDiscordGuildName: null,
		lastDiscordChannelName: null,
		lastEmbeddingModelId: null,
		discordQuickConnect: false,
		discordAutoConversation: false,
		quickConfigLoaded: false,

		_unlisteners: [],
		_setUnlisteners: (unlisteners) => set({ _unlisteners: unlisteners }),

		// Initialize: fetch current state and set up event listeners
		initialize: async () => {
			const { refresh, loadQuickConfig, _setUnlisteners } = get();

			// First, fetch current state from backend
			await refresh();
			await loadQuickConfig();

			const {
				discordQuickConnect,
				lastDiscordGuildId,
				lastDiscordChannelId,
				discordInVoice,
				quickStartDiscord,
			} = get();
			if (
				discordQuickConnect &&
				lastDiscordGuildId &&
				lastDiscordChannelId &&
				!discordInVoice
			) {
				quickStartDiscord();
			}

			// Set up event listeners for state changes
			const unlisteners: UnlistenFn[] = [];

			// Listen for onichan state changes
			const unlistenOnichan = await listen<OnichanState>(
				'onichan-state',
				(event) => {
					set({
						onichanActive: event.payload.active,
						onichanMode: event.payload.mode,
						llmLoaded: event.payload.local_llm_loaded,
						ttsLoaded: event.payload.local_tts_loaded,
					});
				},
			);
			unlisteners.push(unlistenOnichan);

			// Listen for discord state changes
			const unlistenDiscord = await listen<DiscordState>(
				'discord-state',
				(event) => {
					set({
						discordConnected: event.payload.connected,
						discordInVoice: event.payload.in_voice,
						discordGuild: event.payload.guild_name ?? null,
						discordChannel: event.payload.channel_name ?? null,
					});
				},
			);
			unlisteners.push(unlistenDiscord);

			// Listen for memory state changes
			const unlistenMemory = await listen<MemoryState>(
				'memory-status',
				(event) => {
					set({
						memoryRunning: event.payload.is_running,
						memoryModelLoaded: event.payload.model_loaded,
						memoryModelId: null, // MemoryState doesn't include model ID
						memoryCount: event.payload.total_memories,
					});
				},
			);
			unlisteners.push(unlistenMemory);

			// Listen for model download completion (triggers refresh)
			const unlistenDownload = await listen(
				'onichan-model-download-complete',
				() => {
					refresh();
				},
			);
			unlisteners.push(unlistenDownload);

			_setUnlisteners(unlisteners);
		},

		// Refresh all state from backend
		refresh: async () => {
			try {
				// Fetch LLM/TTS state
				const llmLoadedRes = await commands.isLocalLlmLoaded();
				const llmLoaded =
					llmLoadedRes.status === 'ok' ? llmLoadedRes.data : false;
				const ttsLoadedRes = await commands.isLocalTtsLoaded();
				const ttsLoaded =
					ttsLoadedRes.status === 'ok' ? ttsLoadedRes.data : false;

				// Fetch Discord state
				const discordStatus = await commands.discordGetStatus();
				const discordConversationRunning =
					await commands.discordIsConversationRunning();

				// Fetch Onichan state
				const onichanActive = await commands.onichanIsActive();
				const onichanMode = await commands.onichanGetMode();
				const onichanConversationRunning =
					await commands.onichanIsConversationRunning();

				// Fetch Memory state
				const memoryStatusResult = await commands.getMemoryStatus();
				const memoryStatus =
					memoryStatusResult.status === 'ok'
						? memoryStatusResult.data
						: null;

				set({
					llmLoaded,
					ttsLoaded,
					discordConnected: discordStatus.connected,
					discordInVoice: discordStatus.in_voice,
					discordGuild: discordStatus.guild_name ?? null,
					discordChannel: discordStatus.channel_name ?? null,
					discordConversationRunning,
					onichanActive,
					onichanMode,
					onichanConversationRunning,
					memoryRunning: memoryStatus?.is_running ?? false,
					memoryModelLoaded: memoryStatus?.model_loaded ?? false,
					memoryModelId: null, // MemoryStatus doesn't include model ID
				});
			} catch (error) {
				console.error('Failed to refresh sidecar state:', error);
			}
		},

		// Cleanup event listeners
		cleanup: () => {
			const { _unlisteners } = get();
			_unlisteners.forEach((unlisten) => unlisten());
			set({ _unlisteners: [] });
		},

		// Load persisted quick-start config from backend
		loadQuickConfig: async () => {
			try {
				const config = await commands.getSidecarQuickConfig();
				set({
					lastLlmModelId: config.last_llm_model_id ?? null,
					lastTtsModelId: config.last_tts_model_id ?? null,
					lastDiscordGuildId: config.last_discord_guild_id ?? null,
					lastDiscordChannelId:
						config.last_discord_channel_id ?? null,
					lastDiscordGuildName:
						config.last_discord_guild_name ?? null,
					lastDiscordChannelName:
						config.last_discord_channel_name ?? null,
					lastEmbeddingModelId:
						config.last_embedding_model_id ?? null,
					discordQuickConnect: config.discord_quick_connect,
					discordAutoConversation: config.discord_auto_conversation,
					quickConfigLoaded: true,
				});
			} catch (error) {
				console.error('Failed to load sidecar quick config:', error);
			}
		},

		// Persist a single config field
		saveQuickConfigField: async (key: string, value: string | null) => {
			try {
				await commands.setSidecarQuickConfigField(key, value);
			} catch (error) {
				console.error('Failed to save sidecar config field:', error);
			}
		},

		setDiscordAutoConversation: async (enabled: boolean) => {
			set({ discordAutoConversation: enabled });
			try {
				await commands.setSidecarQuickConfigFlag(
					'discord_auto_conversation',
					enabled,
				);
			} catch (error) {
				console.error(
					'Failed to save discord auto conversation:',
					error,
				);
			}
		},

		setDiscordQuickConnect: async (enabled: boolean) => {
			set({ discordQuickConnect: enabled });
			try {
				await commands.setSidecarQuickConfigFlag(
					'discord_quick_connect',
					enabled,
				);
			} catch (error) {
				console.error('Failed to save discord quick connect:', error);
			}
		},

		// LLM actions
		loadLlm: async (modelId: string) => {
			set({ llmLoading: true });
			try {
				const result = await commands.loadLocalLlm(modelId);
				if (result.status === 'ok') {
					set({
						llmLoaded: true,
						llmModelName: modelId,
						lastLlmModelId: modelId,
					});
					get().saveQuickConfigField('last_llm_model_id', modelId);
				} else {
					console.error('Failed to load LLM:', result.error);
				}
			} catch (error) {
				console.error('Failed to load LLM:', error);
			} finally {
				set({ llmLoading: false });
			}
		},

		unloadLlm: async () => {
			try {
				await commands.unloadLocalLlm();
				set({ llmLoaded: false, llmModelName: null });
			} catch (error) {
				console.error('Failed to unload LLM:', error);
			}
		},

		setLlmLoading: (loading: boolean) => set({ llmLoading: loading }),

		quickStartLlm: async () => {
			const { lastLlmModelId, loadLlm } = get();
			if (!lastLlmModelId) return;
			await loadLlm(lastLlmModelId);
		},

		// TTS actions
		loadTts: async (modelId: string) => {
			set({ ttsLoading: true });
			try {
				const result = await commands.loadLocalTts(modelId);
				if (result.status === 'ok') {
					set({ ttsLoaded: true, lastTtsModelId: modelId });
					get().saveQuickConfigField('last_tts_model_id', modelId);
				} else {
					console.error('Failed to load TTS:', result.error);
				}
			} catch (error) {
				console.error('Failed to load TTS:', error);
			} finally {
				set({ ttsLoading: false });
			}
		},

		unloadTts: async () => {
			try {
				await commands.unloadLocalTts();
				set({ ttsLoaded: false });
			} catch (error) {
				console.error('Failed to unload TTS:', error);
			}
		},

		setTtsLoading: (loading: boolean) => set({ ttsLoading: loading }),

		quickStartTts: async () => {
			const { lastTtsModelId, loadTts } = get();
			if (!lastTtsModelId) return;
			await loadTts(lastTtsModelId);
		},

		// Discord actions
		updateDiscordState: (state: Partial<DiscordState>) => {
			set({
				discordConnected: state.connected ?? get().discordConnected,
				discordInVoice: state.in_voice ?? get().discordInVoice,
				discordGuild: state.guild_name ?? get().discordGuild,
				discordChannel: state.channel_name ?? get().discordChannel,
			});
		},

		setDiscordConversationRunning: (running: boolean) => {
			set({ discordConversationRunning: running });
		},

		connectDiscordVoice: async (
			guildId: string,
			channelId: string,
			guildName: string,
			channelName: string,
		) => {
			set({ discordLoading: true });
			try {
				const result = await commands.discordConnect(
					guildId,
					channelId,
				);
				if (result.status === 'ok') {
					set({
						lastDiscordGuildId: guildId,
						lastDiscordChannelId: channelId,
						lastDiscordGuildName: guildName,
						lastDiscordChannelName: channelName,
					});
					get().saveQuickConfigField(
						'last_discord_guild_id',
						guildId,
					);
					get().saveQuickConfigField(
						'last_discord_channel_id',
						channelId,
					);
					get().saveQuickConfigField(
						'last_discord_guild_name',
						guildName,
					);
					get().saveQuickConfigField(
						'last_discord_channel_name',
						channelName,
					);
				} else {
					console.error(
						'Failed to connect Discord voice:',
						result.error,
					);
					return result.error;
				}
				return null;
			} catch (error) {
				console.error('Failed to connect Discord voice:', error);
				return String(error);
			} finally {
				set({ discordLoading: false });
			}
		},

		quickStartDiscord: async () => {
			const {
				lastDiscordGuildId,
				lastDiscordChannelId,
				discordConnected,
			} = get();
			set({ discordLoading: true });
			try {
				// Step 1: Connect bot to Discord gateway if not already connected
				if (!discordConnected) {
					const hasToken = await commands.discordHasToken();
					if (!hasToken) {
						console.error('No Discord token configured');
						return;
					}
					const connectResult =
						await commands.discordConnectWithStoredToken();
					if (connectResult.status !== 'ok') {
						console.error(
							'Failed to connect Discord:',
							connectResult.error,
						);
						return;
					}
					// Wait briefly for Discord cache to populate
					await new Promise((resolve) => setTimeout(resolve, 2000));
				}

				// Step 2: Join last voice channel if we have saved config
				if (lastDiscordGuildId && lastDiscordChannelId) {
					const joinResult = await commands.discordConnect(
						lastDiscordGuildId,
						lastDiscordChannelId,
					);
					if (joinResult.status !== 'ok') {
						console.error(
							'Failed to join voice:',
							joinResult.error,
						);
					} else if (get().discordAutoConversation) {
						const conv = await commands.discordStartConversation();
						if (conv.status !== 'ok') {
							console.error(
								'Failed to auto-start conversation:',
								conv.error,
							);
						} else {
							set({ discordConversationRunning: true });
						}
					}
				}
			} catch (error) {
				console.error('Failed to quick-start Discord:', error);
			} finally {
				set({ discordLoading: false });
			}
		},

		quickStopDiscord: async () => {
			set({ discordLoading: true });
			try {
				await commands.discordDisconnect();
			} catch (error) {
				console.error('Failed to disconnect Discord:', error);
			} finally {
				set({ discordLoading: false });
			}
		},

		// Onichan actions
		updateOnichanState: (state: Partial<OnichanState>) => {
			set({
				onichanActive: state.active ?? get().onichanActive,
				onichanMode: state.mode ?? get().onichanMode,
				llmLoaded: state.local_llm_loaded ?? get().llmLoaded,
				ttsLoaded: state.local_tts_loaded ?? get().ttsLoaded,
			});
		},

		setOnichanConversationRunning: (running: boolean) => {
			set({ onichanConversationRunning: running });
		},

		// Memory actions
		updateMemoryState: (state: Partial<MemoryState>) => {
			set({
				memoryRunning: state.is_running ?? get().memoryRunning,
				memoryModelLoaded:
					state.model_loaded ?? get().memoryModelLoaded,
				memoryCount: state.total_memories ?? get().memoryCount,
			});
		},

		quickStartMemory: async () => {
			const { lastEmbeddingModelId, saveQuickConfigField } = get();
			const modelId = lastEmbeddingModelId;
			if (!modelId) return;
			set({ memoryLoading: true });
			try {
				const result = await commands.loadEmbeddingModel(modelId);
				if (result.status === 'ok') {
					set({
						memoryRunning: true,
						memoryModelLoaded: true,
						lastEmbeddingModelId: modelId,
					});
					saveQuickConfigField('last_embedding_model_id', modelId);
				} else {
					console.error('Failed to start memory:', result.error);
				}
			} catch (error) {
				console.error('Failed to quick-start memory:', error);
			} finally {
				set({ memoryLoading: false });
			}
		},

		quickStopMemory: async () => {
			set({ memoryLoading: true });
			try {
				await commands.stopMemorySidecar();
				set({ memoryRunning: false, memoryModelLoaded: false });
			} catch (error) {
				console.error('Failed to stop memory:', error);
			} finally {
				set({ memoryLoading: false });
			}
		},
	})),
);

// Hook for initializing the store (call once at app startup)
export const initializeSidecarStore = () => {
	const { initialize } = useSidecarStore.getState();
	initialize();
};

// Hook for cleanup (call on app unmount)
export const cleanupSidecarStore = () => {
	const { cleanup } = useSidecarStore.getState();
	cleanup();
};
