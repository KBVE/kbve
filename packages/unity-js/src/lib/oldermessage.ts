import { DiscordSDK } from '@discord/embedded-app-sdk';
import DiscordSDKManager from './discord';

import {
	MessageData,
	MessageParentCommand,
	Entitlement,
	LogEntry,
	LogLevel,
} from '../types';
import { Help } from './helper';

type CommandHandler = (args: any, messageData: MessageData) => Promise<void>;

class MessageHandler {
	private static instance: MessageHandler;
	private discordSdkManager: DiscordSDKManager | null = null;
	private commandMap: Map<string, CommandHandler> = new Map();
	private logs: Map<number, LogEntry> = new Map();
	private helper: typeof Help;

	private constructor(
		discordSdkManager: DiscordSDKManager,
		helper: typeof Help,
	) {
		this.discordSdkManager = discordSdkManager;
		this.helper = helper;
		this.initializeCommandMap();
	}

	public static getInstance(
		discordSdkManager: DiscordSDKManager,
		helper: typeof Help,
	): MessageHandler {
		if (!MessageHandler.instance) {
			MessageHandler.instance = new MessageHandler(
				discordSdkManager,
				helper,
			);
		}
		return MessageHandler.instance;
	}

	private get discordSdk(): DiscordSDK | null {
		return this.discordSdkManager?.getSdk() || null;
	}

	public getLogs(): LogEntry[] {
		return Array.from(this.logs.values());
	}

	public purgeLogs(): void {
		this.logs.clear();
	}

	private initializeCommandMap(): void {
		this.commandMap.set('SUBSCRIBE', this.subscribe.bind(this));
		this.commandMap.set('UNSUBSCRIBE', this.unsubscribe.bind(this));
		this.commandMap.set('SET_ACTIVITY', this.setActivity.bind(this));
		this.commandMap.set('PING_LOAD', this.pingLoad.bind(this));
		this.commandMap.set('GET_INSTANCE_ID', this.getInstanceId.bind(this));
		this.commandMap.set('GET_CHANNEL_ID', this.getChannelId.bind(this));
		this.commandMap.set('GET_GUILD_ID', this.getGuildId.bind(this));
		this.commandMap.set('GET_USER_ID', this.getUserId.bind(this));
		this.commandMap.set('GET_USER', this.getUser.bind(this));
		this.commandMap.set(
			'GET_INSTANCE_PARTICIPANTS',
			this.getInstanceParticipants.bind(this),
		);
		this.commandMap.set(
			'HARDWARE_ACCELERATION',
			this.hardwareAcceleration.bind(this),
		);
		this.commandMap.set('GET_CHANNEL', this.getChannel.bind(this));
		this.commandMap.set(
			'GET_CHANNEL_PERMISSIONS',
			this.getChannelPermissions.bind(this),
		);
		this.commandMap.set(
			'GET_ENTITLEMENTS',
			this.getEntitlements.bind(this),
		);
		this.commandMap.set(
			'GET_PLATFORM_BEHAVIORS',
			this.getPlatformBehaviors.bind(this),
		);
		this.commandMap.set('GET_SKUS', this.getSkus.bind(this));
		this.commandMap.set('IMAGE_UPLOAD', this.imageUpload.bind(this));
		this.commandMap.set('EXTERNAL_LINK', this.externalLink.bind(this));
		this.commandMap.set('INVITE_DIALOG', this.inviteDialog.bind(this));
		this.commandMap.set(
			'SHARE_MOMENT_DIALOG',
			this.shareMomentDialog.bind(this),
		);
	}

	public async handleMessage(messageData: MessageData): Promise<void> {
		if (!this.discordSdk) {
			throw new Error('DiscordSDK is not initialized in MessageHandler.');
		}

		const { command, args } = messageData;

		const handler = this.commandMap.get(String(command));
		if (!handler) {
			this.log('warn', `Unhandled command: ${messageData.command}`);
			return;
		}

		try {
			await handler(args, messageData);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Error handling command '${messageData.command}': ${error.message}`
					: `Unknown error occurred while handling command '${messageData.command}': ${String(error)}`,
				{ error },
			);
		}
	}

	private validateSdkInitialized(): void {
		if (!this.discordSdk) {
			throw new Error('DiscordSDK is not initialized.');
		}
	}

	private async subscribe(args: any, { event }: MessageData): Promise<void> {
		this.validateSdkInitialized();

		if (!event) {
			this.log('error', 'SUBSCRIBE event is undefined.');
			throw new Error('SUBSCRIBE event is undefined.');
		}

		if (args?.channel_id) {
			args = { channel_id: this.discordSdk?.channelId };
			this.log(
				'info',
				`Overriding channel_id with current channel ID: ${args.channel_id}`,
			);
		}

		try {
			await this.discordSdk?.subscribe(
				event,
				this.handleEvent.bind(this),
				args,
			);
			this.log('info', `Subscribed to event '${event}'`);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to subscribe to event '${event}': ${error.message}`
					: `Failed to subscribe to event '${event}': ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async unsubscribe(
		args: any,
		{ event }: MessageData,
	): Promise<void> {
		this.validateSdkInitialized();
		if (!event) {
			this.log('error', 'UNSUBSCRIBE event is undefined.');
			throw new Error('UNSUBSCRIBE event is undefined.');
		}

		if (args?.channel_id) {
			args = { channel_id: this.discordSdk?.channelId };
			this.log(
				'info',
				`Overriding channel_id with current channel ID: ${args.channel_id}`,
			);
		}

		try {
			await this.discordSdk?.unsubscribe(
				event,
				this.handleEvent.bind(this),
			);
			this.log('info', `Unsubscribed from event '${event}'`);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to unsubscribe from event '${event}': ${error.message}`
					: `Failed to unsubscribe from event '${event}': ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async setActivity(args: any): Promise<void> {
		this.validateSdkInitialized();

		if (!args?.activity) {
			this.log('error', 'No activity provided for SET_ACTIVITY.');
			throw new Error('No activity provided for SET_ACTIVITY.');
		}

		const fieldsToClean = [
			{ field: 'assets', key: 'large_image' },
			{ field: 'party', key: 'id' },
			{ field: 'emoji', key: 'id' },
			{ field: 'secrets', key: 'match' },
		];

		args.activity = this.helper.sanitizeFields(
			args.activity,
			fieldsToClean,
		);

		try {
			const data = await this.discordSdk?.commands.setActivity(args);
			this.log('info', 'Activity set successfully', { data });
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to set activity: ${error.message}`
					: `Failed to set activity: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async pingLoad(): Promise<void> {
		this.postMessage('LOADED', { version: '1.0.0' });
		this.log('info', 'Ping load dispatched');
	}

	private async getInstanceId(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		await this.postSdkProperty('instanceId', command, nonce);
	}

	private async getChannelId(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		await this.postSdkProperty('channelId', command, nonce);
	}

	private async getGuildId(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		await this.postSdkProperty('guildId', command, nonce);
	}

	private async getUserId(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		if (!this.discordSdk || !this.discordSdkManager) {
			throw new Error('Discord SDK is not initialized.');
		}

		const user = this.discordSdkManager.getUser();
		if (!user) {
			throw new Error(
				'You need to be authenticated to get the current user ID.',
			);
		}

		this.postMessage(command, { nonce, data: user.id });
		this.log('info', `User ID fetched: ${user.id}`);
	}

	private async getUser(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		if (!this.discordSdk || !this.discordSdkManager) {
			throw new Error('Discord SDK is not initialized.');
		}

		const user = this.discordSdkManager.getUser();
		if (!user) {
			throw new Error(
				'You need to be authenticated to get the current user.',
			);
		}

		this.postMessage(command, { nonce, data: user });
		this.log(
			'info',
			`User details fetched: ${user.username}#${user.discriminator}`,
		);
	}

	private async getInstanceParticipants(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		this.validateSdkInitialized();

		try {
			const data =
				await this.discordSdk?.commands.getInstanceConnectedParticipants();
			this.postMessage(command, { nonce, data });
			this.log(
				'info',
				`Fetched instance participants: ${JSON.stringify(data)}`,
			);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to fetch instance participants: ${error.message}`
					: `Failed to fetch instance participants: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async hardwareAcceleration(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		this.validateSdkInitialized();

		try {
			const data =
				await this.discordSdk?.commands.encourageHardwareAcceleration();
			this.postMessage(command, { nonce, data });
			this.log('info', 'Hardware acceleration encouraged successfully.', {
				data,
			});
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to encourage hardware acceleration: ${error.message}`
					: `Failed to encourage hardware acceleration: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async getChannel(
		args: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		if (!args?.channel_id) {
			throw new Error('No channel ID provided for GET_CHANNEL.');
		}

		this.validateSdkInitialized();

		try {
			const data = await this.discordSdk?.commands.getChannel(args);
			this.postMessage(command, { nonce, data, args });
			this.log('info', `Fetched channel: ${JSON.stringify(data)}`);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to fetch channel: ${error.message}`
					: `Failed to fetch channel: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async getChannelPermissions(
		args: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		if (!args?.channel_id) {
			throw new Error(
				'No channel ID provided for GET_CHANNEL_PERMISSIONS.',
			);
		}

		this.validateSdkInitialized();

		try {
			const data =
				await this.discordSdk?.commands.getChannelPermissions(args);

			if (!data) {
				throw new Error(
					'No permissions data received for the channel.',
				);
			}

			const formattedData = this.helper.stringifyBigInt(
				data as Record<string, unknown>,
			);
			this.postMessage(command, { nonce, data: formattedData, args });
			this.log(
				'info',
				`Fetched channel permissions for channel ID '${args.channel_id}': ${formattedData}`,
			);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to fetch channel permissions: ${error.message}`
					: `Failed to fetch channel permissions: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async getEntitlements(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		this.validateSdkInitialized();

		try {
			const data = await this.discordSdk?.commands.getEntitlements();

			if (!data || !data.entitlements) {
				throw new Error('No entitlement data received.');
			}

			this.postMessage(command, { nonce, data: data.entitlements });
			this.log('info', 'Fetched entitlement successfully', {
				data: data.entitlements,
			});
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to fetch entitlement: ${error.message}`
					: `Failed to fetch entitlement: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async getPlatformBehaviors(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		this.validateSdkInitialized();

		try {
			const data = await this.discordSdk?.commands.getPlatformBehaviors();

			if (!data) {
				throw new Error('No platform behaviors data received.');
			}

			this.postMessage(command, { nonce, data });
			this.log('info', 'Fetched platform behaviors successfully', {
				data,
			});
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to fetch platform behaviors: ${error.message}`
					: `Failed to fetch platform behaviors: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async getSkus(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		this.validateSdkInitialized();

		try {
			const data = await this.discordSdk?.commands.getSkus();

			if (!data || !Array.isArray(data.skus) || data.skus.length === 0) {
				throw new Error('No SKU data received or SKUs are empty.');
			}

			this.postMessage(command, { nonce, data: data.skus });
			this.log('info', 'Fetched SKUs successfully', { data: data.skus });
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to fetch SKUs: ${error.message}`
					: `Failed to fetch SKUs: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async imageUpload(
		_: any,
		{ nonce, command }: MessageData,
	): Promise<void> {
		if (!command || !nonce) {
			throw new Error('Command/Nonce is undefined.');
		}

		this.validateSdkInitialized();

		try {
			const url = await this.discordSdk?.commands.initiateImageUpload();

			if (!url) {
				throw new Error('No image upload URL received.');
			}

			this.postMessage(command, {
				nonce,
				data: { image_url: url, canceled: false },
			});
			this.log('info', `Image upload URL received: ${url}`);
		} catch (error) {
			this.postMessage(command, {
				nonce,
				data: { image_url: '', canceled: true },
			});
			this.log(
				'error',
				error instanceof Error
					? `Failed to initiate image upload: ${error.message}`
					: `Failed to initiate image upload: ${String(error)}`,
				{ error },
			);
		}
	}

	private async externalLink(
		args: any,
		{ command }: MessageData,
	): Promise<void> {
		if (!command) {
			throw new Error('Command is undefined.');
		}

		this.validateSdkInitialized();

		if (!args?.url) {
			throw new Error('No URL provided for EXTERNAL_LINK.');
		}

		try {
			await this.discordSdk?.commands.openExternalLink(args);
			this.log('info', `External link opened: ${args.url}`);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to open external link '${args.url}': ${error.message}`
					: `Failed to open external link '${args.url}': ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async inviteDialog(
		_: any,
		{ command }: MessageData,
	): Promise<void> {
		if (!command) {
			throw new Error('Command is undefined.');
		}

		this.validateSdkInitialized();

		try {
			await this.discordSdk?.commands.openInviteDialog();
			this.log('info', 'Invite dialog opened successfully.');
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to open invite dialog: ${error.message}`
					: `Failed to open invite dialog: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private async shareMomentDialog(
		args: any,
		{ command }: MessageData,
	): Promise<void> {
		if (!command) {
			throw new Error('Command is undefined.');
		}

		this.validateSdkInitialized();

		if (!args?.mediaUrl) {
			throw new Error('No media URL provided for SHARE_MOMENT_DIALOG.');
		}

		try {
			await this.discordSdk?.commands.openShareMomentDialog(args);
			this.log(
				'info',
				`Shared moment dialog opened with URL: ${args.mediaUrl}`,
			);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to open share moment dialog: ${error.message}`
					: `Failed to open share moment dialog: ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	private handleEvent(eventData: Record<string, unknown>): void {
		this.postMessage('DISPATCH', { eventData });
	}

	private postMessage(command: string, data: any): void {
		const iframeResult = this.helper.getNestedIFrame();

		if (iframeResult.error) {
			throw new Error(
				`Failed to get iframe: ${iframeResult.error.message}`,
			);
		}

		const iframe = iframeResult.data;

		if (!iframe?.contentWindow) {
			throw new Error('Iframe contentWindow is null or undefined.');
		}

		iframe.contentWindow.postMessage({ command, ...data }, '*');
	}

	private async postSdkProperty(
		key: keyof DiscordSDK,
		command: string,
		nonce: string,
	): Promise<void> {
		try {
			this.validateSdkInitialized();

			if (!this.discordSdk) {
				throw new Error(`Discord SDK is null`);
			}
			const propertyKey = String(key);
			const propertyValue =
				this.discordSdk[propertyKey as keyof DiscordSDK];
			if (propertyValue === undefined) {
				throw new Error(
					`Property '${propertyKey}' does not exist on DiscordSDK.`,
				);
			}

			this.postMessage(command, { nonce, data: propertyValue });
			this.log('info', `Fetched '${propertyKey}': ${propertyValue}`);
		} catch (error) {
			const keyString = String(key);
			this.log(
				'error',
				error instanceof Error
					? `Failed to fetch '${keyString}': ${error.message}`
					: `Failed to fetch '${keyString}': ${String(error)}`,
				{ error },
			);
			throw error;
		}
	}

	//  [Logger]

	private log(
		level: LogLevel,
		message: string,
		context?: Record<string, unknown>,
	): void {
		const logId = Date.now();
		this.logs.set(logId, { level, message, context });
	}
}

export default MessageHandler;