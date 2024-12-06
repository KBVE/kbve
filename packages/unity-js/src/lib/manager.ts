import DiscordSDKManager from './discord';
import MessageHandler from './message';
import { Help } from './helper';
import {
	DiscordConfigOptions,
	JSFFI_CommandMessage,
	JSFFI_AuthMessage,
	JavaScriptMessageType,
} from '../types';

class Manager {
	private static instance: Manager;
	private helper = Help;
	private discordManager: DiscordSDKManager;
	private messageHandler: MessageHandler;

	private constructor() {
		this.discordManager = DiscordSDKManager.getInstance(this.helper);
		this.messageHandler = MessageHandler.getInstance(
			this.discordManager,
			this.helper,
		);
	}

	public static getInstance(): Manager {
		if (!Manager.instance) {
			Manager.instance = new Manager();
		}
		return Manager.instance;
	}

	public SDK<T>(fn?: (sdk: DiscordSDKManager) => T): T | DiscordSDKManager {
		return fn ? fn(this.discordManager) : this.discordManager;
	}

	public Helper<T>(fn?: (helper: typeof Help) => T): T | typeof Help {
		return fn ? fn(this.helper) : this.helper;
	}

	public Message<T>(fn?: (handler: MessageHandler) => T): T | MessageHandler {
		return fn ? fn(this.messageHandler) : this.messageHandler;
	}

	public async initialize(config: DiscordConfigOptions): Promise<void> {
		await this.SDK((sdk) => sdk.initialize(config));
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

	public getLogs(): any[] {
		return this.messageHandler.getLogs();
	}

	public purgeLogs(): void {
		this.messageHandler.purgeLogs();
	}
}

export default Manager;
