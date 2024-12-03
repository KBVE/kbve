import { DiscordSDK } from '@discord/embedded-app-sdk';
import DiscordSDKManager from './discord';
import {
	MessageData,
	MessageParentCommand,
	LogEntry,
	LogLevel,
} from '../types';
import { getNestedIFrame } from './helper';

type CommandHandler = (args: any, messageData: MessageData) => Promise<void>;

class MessageHandler {
	private static instance: MessageHandler;
	private discordSdkManager: DiscordSDKManager | null = null;
	private commandMap: Map<string, CommandHandler> = new Map();
	private logs: Map<number, LogEntry> = new Map();

	private constructor(discordSdkManager: DiscordSDKManager) {
		this.discordSdkManager = discordSdkManager;
		this.initializeCommandMap();
	}

	public static getInstance(
		discordSdkManager: DiscordSDKManager,
	): MessageHandler {
		if (!MessageHandler.instance) {
			MessageHandler.instance = new MessageHandler(discordSdkManager);
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
	}

	public async handleMessage(messageData: MessageData): Promise<void> {
		if (!this.discordSdk) {
			throw new Error('DiscordSDK is not initialized in MessageHandler.');
		}

		const { command, args } = messageData;

		const handler = this.commandMap.get(command!);
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

		args.activity = this.sanitizeFields(args.activity, fieldsToClean);

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

	private handleEvent(eventData: Record<string, unknown>): void {
		this.postMessage('DISPATCH', { eventData });
	}

	private postMessage(command: string, data: any): void {
		getNestedIFrame().contentWindow?.postMessage({ command, ...data }, '*');
	}

	private sanitizeFields(
		target: any,
		fieldsToClean: Array<{ field: string; key: string }>,
	): any {
		if (!target) return target;

		for (const { field, key } of fieldsToClean) {
			if (target[field]?.[key] === '') {
				delete target[field];
			}
		}

		return target;
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

			const propertyValue = this.discordSdk[key];
			if (propertyValue === undefined) {
				throw new Error(
					`Property '${key}' does not exist on DiscordSDK.`,
				);
			}

			this.postMessage(command, { nonce, data: propertyValue });
			this.log('info', `Fetched '${key}': ${propertyValue}`);
		} catch (error) {
			this.log(
				'error',
				error instanceof Error
					? `Failed to fetch '${key}': ${error.message}`
					: `Failed to fetch '${key}': ${String(error)}`,
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
