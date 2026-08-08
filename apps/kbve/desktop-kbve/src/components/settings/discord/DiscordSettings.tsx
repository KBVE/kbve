import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { commands, GuildInfo, ChannelInfo } from '@/bindings';
import { SettingsGroup } from '../../ui/SettingsGroup';
import { useAppStore } from '@/stores/app';
import { useSidecarStore } from '@/stores/sidecarStore';
import {
	Bot,
	Link,
	Unlink,
	Hash,
	Users,
	AlertCircle,
	Loader2,
	Key,
	Trash2,
	Check,
	Mic,
	MessageSquare,
	RefreshCw,
	Volume2,
} from 'lucide-react';

interface DiscordState {
	connected: boolean;
	in_voice: boolean;
	listening: boolean;
	guild_name: string | null;
	channel_name: string | null;
	error: string | null;
}

// Using GuildInfo and ChannelInfo from bindings

export const DiscordSettings: React.FC = () => {
	const { t } = useTranslation();
	// Token input is separate from saved token - we never show the real token
	const [tokenInput, setTokenInput] = useState('');
	const [hasToken, setHasToken] = useState(false);
	const [maskedToken, setMaskedToken] = useState<string | null>(null);
	const [isSavingToken, setIsSavingToken] = useState(false);
	const [tokenSaved, setTokenSaved] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [isInVoice, setIsInVoice] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [guilds, setGuilds] = useState<GuildInfo[]>([]);
	const [channels, setChannels] = useState<ChannelInfo[]>([]);
	const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
	const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
	const [connectedGuild, setConnectedGuild] = useState<string | null>(null);
	const [connectedChannel, setConnectedChannel] = useState<string | null>(
		null,
	);
	const [isConversationMode, setIsConversationMode] = useState(false);
	const [conversationState, setConversationState] =
		useState<string>('stopped');
	const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<string | null>(
		null,
	);
	const [isBotOnline, setIsBotOnline] = useState(false);

	const setActiveView = useAppStore((s) => s.setActiveView);
	const {
		connectDiscordVoice,
		discordQuickConnect,
		setDiscordQuickConnect,
		lastDiscordGuildId,
		lastDiscordChannelId,
		quickConfigLoaded,
	} = useSidecarStore();

	// Check if token exists on mount (we only get masked version)
	useEffect(() => {
		const checkToken = async () => {
			const exists = await commands.discordHasToken();
			setHasToken(exists);
			if (exists) {
				const masked = await commands.discordGetToken();
				setMaskedToken(masked);
			}
		};
		checkToken();

		commands.discordGetStatus().then((status) => {
			setIsConnected(status.connected);
			setIsInVoice(status.in_voice);
			setConnectedGuild(status.guild_name);
			setConnectedChannel(status.channel_name);
			setError(status.error);
			// Bot is online if connected to Discord gateway (even before joining voice)
			setIsBotOnline(status.connected);
		});

		// Check conversation mode status
		commands.discordIsConversationRunning().then((running) => {
			setIsConversationMode(running);
		});
	}, []);

	// Listen for Discord state changes
	useEffect(() => {
		const unlistenState = listen<DiscordState>('discord-state', (event) => {
			setIsConnected(event.payload.connected);
			setIsInVoice(event.payload.in_voice);
			setConnectedGuild(event.payload.guild_name);
			setConnectedChannel(event.payload.channel_name);
			setError(event.payload.error);
			setIsConnecting(false);
			setConnectionStatus(null); // Clear connecting status on state update
			setIsBotOnline(event.payload.connected);
		});

		// Listen for conversation state changes
		const unlistenConversation = listen<string>(
			'discord-conversation-state',
			(event) => {
				setConversationState(event.payload);
				setIsConversationMode(event.payload !== 'stopped');
			},
		);

		return () => {
			unlistenState.then((fn) => fn());
			unlistenConversation.then((fn) => fn());
		};
	}, []);

	const handleSaveToken = useCallback(async () => {
		if (!tokenInput.trim()) {
			setError(t('discord.errors.tokenRequired'));
			return;
		}

		setIsSavingToken(true);
		setError(null);

		const result = await commands.discordSetToken(tokenInput.trim());
		if (result.status === 'error') {
			setError(result.error);
			setIsSavingToken(false);
			return;
		}

		// Token saved successfully
		setHasToken(true);
		const masked = await commands.discordGetToken();
		setMaskedToken(masked);
		setTokenInput(''); // Clear the input - never keep the real token in state
		setIsSavingToken(false);
		setTokenSaved(true);

		// Show success briefly
		setTimeout(() => setTokenSaved(false), 2000);

		// Try to connect and fetch guilds with retry
		setConnectionStatus(t('discord.status.connecting'));
		const connectResult = await commands.discordConnectWithStoredToken();
		if (connectResult.status === 'ok') {
			setIsBotOnline(true);
			setConnectionStatus(t('discord.status.fetchingServers'));
			setIsLoadingGuilds(true);

			// Retry fetching guilds a few times as cache may take time to populate
			let attempts = 0;
			const maxAttempts = 5;
			const delay = 1000;

			while (attempts < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, delay));
				const guildsResult = await commands.discordGetGuilds();
				if (
					guildsResult.status === 'ok' &&
					guildsResult.data.length > 0
				) {
					setGuilds(guildsResult.data);
					setConnectionStatus(null);
					break;
				}
				attempts++;
				setConnectionStatus(
					t('discord.status.waitingForServers', {
						attempt: attempts,
						max: maxAttempts,
					}),
				);
			}

			setIsLoadingGuilds(false);
			if (guilds.length === 0) {
				setConnectionStatus(t('discord.status.noServersFound'));
			} else {
				setConnectionStatus(null);
			}
		} else {
			setConnectionStatus(null);
		}
	}, [tokenInput, t, guilds.length]);

	const handleClearToken = useCallback(async () => {
		const result = await commands.discordClearToken();
		if (result.status === 'error') {
			setError(result.error);
			return;
		}

		setHasToken(false);
		setMaskedToken(null);
		setTokenInput('');
		setIsConnected(false);
		setGuilds([]);
		setChannels([]);
		setSelectedGuild(null);
		setSelectedChannel(null);
	}, []);

	const handleGuildChange = useCallback(async (guildId: string) => {
		setSelectedGuild(guildId);
		setSelectedChannel(null);
		// Fetch channels for selected guild
		const channelsResult = await commands.discordGetChannels(guildId);
		if (channelsResult.status === 'ok') {
			setChannels(channelsResult.data);
		}
	}, []);

	// Seed guild/channel selection from the persisted quick config
	useEffect(() => {
		if (!quickConfigLoaded || selectedGuild || guilds.length === 0) return;
		if (!lastDiscordGuildId) return;
		if (!guilds.some((g) => g.id === lastDiscordGuildId)) return;
		setSelectedGuild(lastDiscordGuildId);
		commands.discordGetChannels(lastDiscordGuildId).then((result) => {
			if (result.status !== 'ok') return;
			setChannels(result.data);
			if (
				lastDiscordChannelId &&
				result.data.some((c) => c.id === lastDiscordChannelId)
			) {
				setSelectedChannel(lastDiscordChannelId);
			}
		});
	}, [
		quickConfigLoaded,
		guilds,
		selectedGuild,
		lastDiscordGuildId,
		lastDiscordChannelId,
	]);

	const handleConnect = useCallback(async () => {
		if (!selectedGuild || !selectedChannel) {
			setError(t('discord.errors.selectChannel'));
			return;
		}
		setIsConnecting(true);
		setError(null);
		const guildName =
			guilds.find((g) => g.id === selectedGuild)?.name ?? selectedGuild;
		const channelName =
			channels.find((c) => c.id === selectedChannel)?.name ??
			selectedChannel;
		const connectError = await connectDiscordVoice(
			selectedGuild,
			selectedChannel,
			guildName,
			channelName,
		);
		if (connectError) {
			setError(connectError);
			setIsConnecting(false);
		}
	}, [
		selectedGuild,
		selectedChannel,
		guilds,
		channels,
		connectDiscordVoice,
		t,
	]);

	const handleDisconnect = useCallback(async () => {
		// Stop conversation mode first if running
		if (isConversationMode) {
			await commands.discordStopConversation();
			setIsConversationMode(false);
		}
		const result = await commands.discordDisconnect();
		if (result.status === 'error') {
			setError(result.error);
		}
	}, [isConversationMode]);

	const handleToggleConversation = useCallback(async () => {
		if (isConversationMode) {
			commands.discordStopConversation();
			setIsConversationMode(false);
		} else {
			const result = await commands.discordStartConversation();
			if (result.status === 'ok') {
				setIsConversationMode(true);
			} else {
				setError(result.error);
			}
		}
	}, [isConversationMode]);

	const handleRefreshGuilds = useCallback(async () => {
		setIsLoadingGuilds(true);
		setConnectionStatus(t('discord.status.fetchingServers'));
		const guildsResult = await commands.discordGetGuilds();
		if (guildsResult.status === 'ok') {
			setGuilds(guildsResult.data);
			if (guildsResult.data.length === 0) {
				setConnectionStatus(t('discord.status.noServersFound'));
			} else {
				setConnectionStatus(null);
			}
		} else {
			setError(guildsResult.error);
			setConnectionStatus(null);
		}
		setIsLoadingGuilds(false);
	}, [t]);

	const handleReconnect = useCallback(async () => {
		setIsConnecting(true);
		setError(null);
		setConnectionStatus(t('discord.status.connecting'));

		const connectResult = await commands.discordConnectWithStoredToken();
		if (connectResult.status === 'ok') {
			setIsBotOnline(true);
			setConnectionStatus(t('discord.status.fetchingServers'));
			setIsLoadingGuilds(true);

			// Retry fetching guilds a few times as cache may take time to populate
			let attempts = 0;
			const maxAttempts = 5;
			const delay = 1000;

			while (attempts < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, delay));
				const guildsResult = await commands.discordGetGuilds();
				if (
					guildsResult.status === 'ok' &&
					guildsResult.data.length > 0
				) {
					setGuilds(guildsResult.data);
					setConnectionStatus(null);
					break;
				}
				attempts++;
				setConnectionStatus(
					t('discord.status.waitingForServers', {
						attempt: attempts,
						max: maxAttempts,
					}),
				);
			}

			setIsLoadingGuilds(false);
			if (guilds.length === 0 && attempts >= maxAttempts) {
				setConnectionStatus(t('discord.status.noServersFound'));
			}
		} else {
			setError(connectResult.error);
			setIsBotOnline(false);
			setConnectionStatus(null);
		}
		setIsConnecting(false);
	}, [t, guilds.length]);

	return (
		<div className="flex flex-col gap-6 max-w-3xl w-full mx-auto">
			{/* Bot Token Configuration */}
			<SettingsGroup title={t('discord.title')}>
				<div className="p-4">
					<div className="flex items-center gap-2 mb-4">
						<Bot className="w-5 h-5 text-logo-primary" />
						<h3 className="font-medium">
							{t('discord.botConfiguration')}
						</h3>
					</div>

					<p className="text-sm text-text/60 mb-4">
						{t('discord.description')}
					</p>

					{/* Show saved token status or input */}
					{hasToken ? (
						<div className="mb-4">
							<label className="flex items-center gap-2 text-sm font-medium mb-2">
								<Key className="w-4 h-4 text-text/60" />
								{t('discord.botToken.label')}
							</label>
							<div className="flex gap-2 items-center">
								<div className="flex-1 px-3 py-2 bg-background-dark/50 border border-background-dark rounded-lg text-sm font-mono text-text/60">
									{maskedToken || '********'}
								</div>
								<button
									onClick={handleClearToken}
									className="px-3 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
									title={t('discord.botToken.clear')}>
									<Trash2 className="w-4 h-4" />
									{t('discord.botToken.clear')}
								</button>
							</div>
							<p className="text-xs text-green-400/70 mt-1 flex items-center gap-1">
								<Check className="w-3 h-3" />
								{t('discord.botToken.saved')}
							</p>
						</div>
					) : (
						<div className="mb-4">
							<label className="flex items-center gap-2 text-sm font-medium mb-2">
								<Key className="w-4 h-4 text-text/60" />
								{t('discord.botToken.label')}
							</label>
							<div className="flex gap-2">
								<input
									type="password"
									value={tokenInput}
									onChange={(e) =>
										setTokenInput(e.target.value)
									}
									placeholder={t(
										'discord.botToken.placeholder',
									)}
									className="flex-1 px-3 py-2 bg-background-dark/50 border border-background-dark rounded-lg text-sm focus:outline-none focus:border-logo-primary"
									autoComplete="off"
									spellCheck={false}
								/>
								<button
									onClick={handleSaveToken}
									disabled={
										isSavingToken || !tokenInput.trim()
									}
									className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
										isSavingToken || !tokenInput.trim()
											? 'bg-background-dark/30 text-text/30 cursor-not-allowed'
											: 'bg-logo-primary/20 text-logo-primary hover:bg-logo-primary/30'
									}`}>
									{isSavingToken ? (
										<Loader2 className="w-4 h-4 animate-spin" />
									) : tokenSaved ? (
										<Check className="w-4 h-4" />
									) : null}
									{t('discord.botToken.save')}
								</button>
							</div>
							<p className="text-xs text-text/40 mt-1">
								{t('discord.botToken.hint')}
							</p>
							<p className="text-xs text-yellow-400/70 mt-1">
								{t('discord.botToken.securityNote')}
							</p>
						</div>
					)}

					{/* Bot Online/Offline Status */}
					{hasToken && (
						<div
							className={`mb-4 p-3 rounded-lg flex items-center justify-between ${
								isBotOnline
									? 'bg-green-500/10 border border-green-500/30'
									: 'bg-yellow-500/10 border border-yellow-500/30'
							}`}>
							<div className="flex items-center gap-2">
								<span className="relative flex h-3 w-3">
									{isBotOnline ? (
										<>
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
											<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
										</>
									) : (
										<span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
									)}
								</span>
								<span
									className={`text-sm font-medium ${isBotOnline ? 'text-green-400' : 'text-yellow-400'}`}>
									{isBotOnline
										? t('discord.status.botOnline')
										: t('discord.status.botOffline')}
								</span>
							</div>
							{!isBotOnline && !isConnecting && (
								<button
									onClick={handleReconnect}
									disabled={isConnecting}
									className="px-3 py-1 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded text-sm font-medium transition-colors flex items-center gap-1">
									<Link className="w-3 h-3" />
									{t('discord.reconnect')}
								</button>
							)}
						</div>
					)}

					{/* Error Display */}
					{error && (
						<div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
							<AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
							<span className="text-sm text-red-400">
								{error}
							</span>
						</div>
					)}

					{/* Connection Progress Status */}
					{connectionStatus && (
						<div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-2">
							<Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
							<span className="text-sm text-blue-400">
								{connectionStatus}
							</span>
						</div>
					)}

					{/* Voice Channel Connection Status - Show when in voice */}
					{isInVoice && (
						<div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
							<div className="flex items-center gap-2 mb-2">
								<span className="relative flex h-3 w-3">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
									<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
								</span>
								<span className="text-sm font-medium text-green-400">
									{t('discord.status.connected')}
								</span>
							</div>
							<div className="flex items-center gap-4 text-xs text-text/60">
								{connectedGuild && (
									<span className="flex items-center gap-1">
										<Users className="w-3 h-3" />
										{connectedGuild}
									</span>
								)}
								{connectedChannel && (
									<span className="flex items-center gap-1">
										<Volume2 className="w-3 h-3" />
										{connectedChannel}
									</span>
								)}
							</div>
						</div>
					)}
				</div>
			</SettingsGroup>

			{/* Server/Channel Selection - Show when bot is online but not in a voice channel */}
			{hasToken && isBotOnline && !isInVoice && (
				<SettingsGroup title={t('discord.connection.title')}>
					<div className="p-4">
						{/* Guild Selection */}
						<div className="mb-4">
							<label className="flex items-center gap-2 text-sm font-medium mb-2">
								<Users className="w-4 h-4 text-text/60" />
								{t('discord.guild.label')}
							</label>
							<div className="flex gap-2">
								<select
									value={selectedGuild || ''}
									onChange={(e) =>
										handleGuildChange(e.target.value)
									}
									disabled={isLoadingGuilds}
									className="flex-1 px-3 py-2 bg-background-dark/50 border border-background-dark rounded-lg text-sm focus:outline-none focus:border-logo-primary disabled:opacity-50">
									<option value="">
										{isLoadingGuilds
											? t('discord.guild.loading')
											: t('discord.guild.placeholder')}
									</option>
									{guilds.map((guild) => (
										<option key={guild.id} value={guild.id}>
											{guild.name}
										</option>
									))}
								</select>
								<button
									onClick={handleRefreshGuilds}
									disabled={isLoadingGuilds}
									className="px-3 py-2 bg-background-dark/50 border border-background-dark rounded-lg text-sm hover:bg-background-dark/70 transition-colors disabled:opacity-50"
									title={t('discord.guild.refresh')}>
									<RefreshCw
										className={`w-4 h-4 ${isLoadingGuilds ? 'animate-spin' : ''}`}
									/>
								</button>
							</div>
							{guilds.length === 0 && !isLoadingGuilds && (
								<p className="text-xs text-yellow-400/70 mt-1">
									{t('discord.guild.noServersHint')}
								</p>
							)}
						</div>

						{/* Channel Selection */}
						{selectedGuild && (
							<div className="mb-4">
								<label className="flex items-center gap-2 text-sm font-medium mb-2">
									<Hash className="w-4 h-4 text-text/60" />
									{t('discord.channel.label')}
								</label>
								<select
									value={selectedChannel || ''}
									onChange={(e) =>
										setSelectedChannel(e.target.value)
									}
									className="w-full px-3 py-2 bg-background-dark/50 border border-background-dark rounded-lg text-sm focus:outline-none focus:border-logo-primary">
									<option value="">
										{t('discord.channel.placeholder')}
									</option>
									{channels.map((channel) => (
										<option
											key={channel.id}
											value={channel.id}>
											{channel.name}
										</option>
									))}
								</select>
							</div>
						)}

						{/* Connect Button */}
						<button
							onClick={handleConnect}
							disabled={
								!selectedGuild ||
								!selectedChannel ||
								isConnecting
							}
							className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
								!selectedGuild ||
								!selectedChannel ||
								isConnecting
									? 'bg-background-dark/30 text-text/30 cursor-not-allowed'
									: 'bg-logo-primary/20 text-logo-primary hover:bg-logo-primary/30'
							}`}>
							{isConnecting ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									{t('discord.connecting')}
								</>
							) : (
								<>
									<Link className="w-4 h-4" />
									{t('discord.connect')}
								</>
							)}
						</button>

						{/* Quick Connect Toggle */}
						<div className="flex items-center justify-between mt-4">
							<div>
								<p className="text-sm font-medium">
									{t('discord.quickConnect.label')}
								</p>
								<p className="text-xs text-text/50">
									{t('discord.quickConnect.description')}
								</p>
							</div>
							<button
								role="switch"
								aria-checked={discordQuickConnect}
								onClick={() =>
									setDiscordQuickConnect(!discordQuickConnect)
								}
								className={`relative w-10 h-6 rounded-full transition-colors ${
									discordQuickConnect
										? 'bg-logo-primary'
										: 'bg-background-dark'
								}`}>
								<span
									className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
										discordQuickConnect
											? 'translate-x-5'
											: 'translate-x-1'
									}`}
								/>
							</button>
						</div>
					</div>
				</SettingsGroup>
			)}

			{/* Model management lives in the Models view */}
			{hasToken && isBotOnline && (
				<SettingsGroup title={t('discord.models.llmTitle')}>
					<div className="p-4 flex items-center justify-between gap-4">
						<p className="text-sm text-text/60">
							{t('discord.models.llmDescription')}
						</p>
						<button
							onClick={() => setActiveView('models')}
							className="px-4 py-2 rounded-lg text-sm font-medium bg-logo-primary/20 text-logo-primary hover:bg-logo-primary/30 transition-colors whitespace-nowrap">
							Manage models
						</button>
					</div>
				</SettingsGroup>
			)}

			{/* Conversation Mode - Voice Assistant */}
			{isConnected && isInVoice && (
				<SettingsGroup title={t('discord.conversation.title')}>
					<div className="p-4">
						<div className="flex items-center gap-2 mb-4">
							<MessageSquare className="w-5 h-5 text-logo-primary" />
							<h3 className="font-medium">
								{t('discord.conversation.label')}
							</h3>
						</div>
						<p className="text-sm text-text/60 mb-4">
							{t('discord.conversation.description')}
						</p>

						{/* Conversation Status */}
						{isConversationMode && (
							<div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
								<div className="flex items-center gap-2 mb-1">
									<span className="relative flex h-3 w-3">
										<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
										<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
									</span>
									<span className="text-sm font-medium text-green-400">
										{conversationState === 'listening'
											? t(
													'discord.conversation.status.listening',
												)
											: conversationState ===
												  'transcribing'
												? t(
														'discord.conversation.status.transcribing',
													)
												: conversationState ===
													  'thinking'
													? t(
															'discord.conversation.status.thinking',
														)
													: conversationState ===
														  'speaking'
														? t(
																'discord.conversation.status.speaking',
															)
														: t(
																'discord.conversation.status.active',
															)}
									</span>
								</div>
							</div>
						)}

						{/* Toggle Button */}
						<button
							onClick={handleToggleConversation}
							className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
								isConversationMode
									? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
									: 'bg-logo-primary/20 text-logo-primary hover:bg-logo-primary/30'
							}`}>
							{isConversationMode ? (
								<>
									<Mic className="w-4 h-4" />
									{t('discord.conversation.stop')}
								</>
							) : (
								<>
									<Mic className="w-4 h-4" />
									{t('discord.conversation.start')}
								</>
							)}
						</button>

						{!isConversationMode && (
							<p className="text-xs text-text/40 mt-2 text-center">
								{t('discord.conversation.hint')}
							</p>
						)}
					</div>
				</SettingsGroup>
			)}

			{/* Disconnect Button - Show when in voice channel */}
			{isInVoice && (
				<SettingsGroup title={t('discord.controls.title')}>
					<div className="p-4">
						<p className="text-sm text-text/60 mb-4">
							{t('discord.controls.description')}
						</p>
						<button
							onClick={handleDisconnect}
							className="w-full py-3 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
							<Unlink className="w-4 h-4" />
							{t('discord.disconnect')}
						</button>
					</div>
				</SettingsGroup>
			)}

			{/* Instructions */}
			{!hasToken && (
				<div className="text-center text-text/60 py-8">
					<Bot className="w-16 h-16 mx-auto mb-4 text-text/30" />
					<p className="text-lg mb-2">{t('discord.setup.title')}</p>
					<p className="text-sm mb-4">
						{t('discord.setup.description')}
					</p>
					<ol className="text-sm text-left max-w-md mx-auto space-y-2">
						<li className="flex gap-2">
							<span className="font-medium text-logo-primary">
								1.
							</span>
							{t('discord.setup.step1')}
						</li>
						<li className="flex gap-2">
							<span className="font-medium text-logo-primary">
								2.
							</span>
							{t('discord.setup.step2')}
						</li>
						<li className="flex gap-2">
							<span className="font-medium text-logo-primary">
								3.
							</span>
							{t('discord.setup.step3')}
						</li>
						<li className="flex gap-2">
							<span className="font-medium text-logo-primary">
								4.
							</span>
							{t('discord.setup.step4')}
						</li>
					</ol>
				</div>
			)}
		</div>
	);
};
