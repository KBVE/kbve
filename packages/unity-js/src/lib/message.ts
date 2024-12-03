import { DiscordSDK } from '@discord/embedded-app-sdk';
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
	private discordSdk: DiscordSDK | null = null;
	private commandMap: Map<string, CommandHandler> = new Map();
	private logs: Map<number, LogEntry> = new Map();

	private constructor() {
		this.initializeCommandMap();
	}

	public static getInstance(): MessageHandler {
		if (!MessageHandler.instance) {
			MessageHandler.instance = new MessageHandler();
		}
		return MessageHandler.instance;
	}

	public initialize(discordSdk: DiscordSDK): void {
		this.discordSdk = discordSdk;
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

	private handleEvent(eventData: Record<string, unknown>): void {
		this.postMessage('DISPATCH', { eventData });
	}

	private postMessage(command: string, data: any): void {
		getNestedIFrame().contentWindow?.postMessage({ command, data }, '*');
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

export default MessageHandler.getInstance();
