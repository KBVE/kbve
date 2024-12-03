import DiscordSDKManager from './discord';
import { Help } from './helper';
import {
	DiscordConfigOptions,
	JSFFI_CommandMessage,
	JSFFI_AuthMessage,
	JavaScriptMessageType,
} from '../types';

class Manager {
	private static instance: Manager;
	private discordManager = DiscordSDKManager.getInstance();
	private helper = Help;

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	private constructor() {}

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
}

export default Manager;
