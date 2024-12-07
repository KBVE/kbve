import DiscordSDKManager from './discord';
import MessageHandler from './message';
import { Help } from './helper';
import {
	DiscordConfigOptions,
	JSFFI_CommandMessage,
	JSFFI_AuthMessage,
	JavaScriptMessageType,
	LogEntry,
} from '../types';

export class Manager {
	private static instance: Manager;
	private helper = Help;
	private discordManager: DiscordSDKManager | null = null;
	private messageHandler: MessageHandler | null = null;
	private ready = false;

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	private constructor() {}

	public static getInstance(): Manager {
		if (!Manager.instance) {
			Manager.instance = new Manager();
		}
		return Manager.instance;
	}

	public async initialize(config: DiscordConfigOptions): Promise<void> {
		if (this.ready) {
			console.warn('Manager is already initialized.');
			return;
		}

		this.discordManager = DiscordSDKManager.getInstance(this.helper);
		await this.discordManager.initialize(config);

		this.messageHandler = MessageHandler.getInstance(
			this.discordManager,
			this.helper,
		);

		this.ready = true;
	}

	private getSDKManager(): DiscordSDKManager {
		if (!this.ready || !this.discordManager) {
			throw new Error(
				'Manager is not initialized. Call initialize() first.',
			);
		}
		return this.discordManager;
	}

	private getMessageHandler(): MessageHandler {
		if (!this.ready || !this.messageHandler) {
			throw new Error(
				'MessageHandler is not initialized. Call initialize() first.',
			);
		}
		return this.messageHandler;
	}

	public SDK<T>(fn?: (sdk: DiscordSDKManager) => T): T | DiscordSDKManager {
		return fn ? fn(this.getSDKManager()) : this.getSDKManager();
	}

	public Helper<T>(fn?: (helper: typeof Help) => T): T | typeof Help {
		return fn ? fn(this.helper) : this.helper;
	}

	public Message<T = MessageHandler>(fn?: (handler: MessageHandler) => T): T {
		const messageHandler = this.getMessageHandler();
		return fn ? fn(messageHandler) : messageHandler as T;
	}

	public getAuthenticatedUser() {
		return this.SDK((sdk) => sdk.getUser());
	}

	public sendCommand(command: JSFFI_CommandMessage['payload']): void {
		const message = {
			type: JavaScriptMessageType.Command,
			payload: command,
		} as JSFFI_CommandMessage;

		this.SDK((sdk) => sdk.sendMessage(message));
	}

	public async handleMessage(data: any): Promise<void> {
		await this.Message((handler) => handler.handleMessage(data));
	}

	public getLogs(): LogEntry[] {
		return this.Message((handler) => handler.getLogs());
	}

	public purgeLogs(): void {
		this.Message((handler) => handler.purgeLogs());
	}
}

export default Manager;
