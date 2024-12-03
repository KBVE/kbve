import { DiscordSDK } from '@discord/embedded-app-sdk';
import { MessageData, MessageParentCommand } from '../types';
import { getNestedIFrame } from './helper';

type CommandHandler = (args: any, messageData: MessageData) => Promise<void>;

class MessageHandler {
	private static instance: MessageHandler;
	private discordSdk: DiscordSDK | null = null;

	private commandMap: Map<string, CommandHandler> = new Map();

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
			console.warn(`Unhandled command: ${command}`);
			return;
		}

		try {
			await handler(args, messageData);
		} catch (error) {
			console.error(`Error handling command '${command}':`, error);
		}
	}

    private validateSdkInitialized(): void {
        if (!this.discordSdk) {
          throw new Error('DiscordSDK is not initialized.');
        }
    }

	private async subscribe(args: any, { event }: MessageData): Promise<void> {
        this.validateSdkInitialized();
		if (!event) throw new Error('SUBSCRIBE event is undefined.');
		await this.discordSdk?.subscribe(
			event,
			this.handleEvent.bind(this),
			args,
		);
	}

	private async unsubscribe(
		args: any,
		{ event }: MessageData,
	): Promise<void> {
        this.validateSdkInitialized();
		if (!event) throw new Error('UNSUBSCRIBE event is undefined.');
		await this.discordSdk?.unsubscribe(event, this.handleEvent.bind(this));
	}

	private async setActivity(args: any): Promise<void> {
        this.validateSdkInitialized();
		if (!args.activity)
			throw new Error('No activity provided for SET_ACTIVITY.');
		await this.discordSdk?.commands.setActivity(args);
	}

	private async pingLoad(): Promise<void> {
		this.postMessage('LOADED', { version: '1.0.0' });
	}

	private handleEvent(eventData: Record<string, unknown>): void {
		this.postMessage('DISPATCH', { eventData });
	}

	private postMessage(command: string, data: any): void {
		getNestedIFrame().contentWindow?.postMessage({ command, data }, '*');
	}
}

export default MessageHandler.getInstance();