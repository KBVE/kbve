import { DiscordSDK } from '@discord/embedded-app-sdk';
import MessageHandler from './message';
import { Help } from './helper';

import {
	DiscordConfigOptions,
	JSFFI_Message,
	JSFFI_AuthMessage,
	JSFFI_CommandMessage,
	JSFFI_NotificationMessage,
	JavaScriptListenerState,
	JavaScriptMessageType,
	CompatibleUser,
	MessageData,
} from '../types';

class DiscordSDKManager {
	private static instance: DiscordSDKManager | null = null;
	private messageHandler: MessageHandler | null = null;
	private helper: typeof Help | null = null;

	private discordSdk: DiscordSDK | null = null;
	private user: CompatibleUser | null = null;
	private state: JavaScriptListenerState = JavaScriptListenerState.None;

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	private constructor() {}

	public static getInstance(): DiscordSDKManager {
		if (!DiscordSDKManager.instance) {
			DiscordSDKManager.instance = new DiscordSDKManager();
		}
		return DiscordSDKManager.instance;
	}

	public async initialize(config: DiscordConfigOptions): Promise<void> {
		if (this.discordSdk) {
			console.warn('DiscordSDK is already initialized.');
			return;
		}

		try {
			this.state = JavaScriptListenerState.Initializing;

			// Initialize DiscordSDK
			this.discordSdk = new DiscordSDK(config.clientId);
			await this.discordSdk.ready();
			this.state = JavaScriptListenerState.Connected;

			// Authenticate the user
			const { code } = await this.discordSdk.commands.authorize({
				client_id: config.clientId,
				response_type: 'code',
				state: '',
				prompt: 'none',
				scope: config.scope,
			});

			const tokenResponse = await fetch(config.tokenRoute, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code }),
			});

			const tokenData = await tokenResponse.json();
			if (!tokenData.access_token) {
				throw new Error('No access_token field found in response.');
			}

			const { user }: { user: CompatibleUser } =
				await this.discordSdk.commands.authenticate({
					access_token: tokenData.access_token,
				});

			this.user = user;
			this.state = JavaScriptListenerState.Authenticated;
			this.helper = Help;
			this.messageHandler = MessageHandler.getInstance(this, this.helper);
			this.setupMessageListener();
		} catch (error) {
			this.state = JavaScriptListenerState.Error;
			console.error('Error initializing DiscordSDK:', error);
			throw error;
		}
	}

	private setupMessageListener(): void {
		if (!this.messageHandler) {
			throw new Error('MessageHandler is not initialized.');
		}

		window.addEventListener('message', async (event: MessageEvent) => {
			try {
				const messageData = event.data as MessageData;

				if (
					typeof messageData !== 'object' ||
					Array.isArray(messageData) ||
					messageData === null
				) {
					console.warn(
						'Received invalid or empty message:',
						event.data,
					);
					return;
				}

				if (!this.discordSdk || !this.user) {
					console.warn(
						'SDK or user not ready. Waiting for initialization...',
					);
					await this.initializePending();
				}

				if (this.messageHandler) {
					await this.messageHandler.handleMessage(messageData);
				} else {
					console.error(
						'MessageHandler is not available to handle the message.',
					);
				}
			} catch (error) {
				console.error('Error handling message:', error);
			}
		});
	}

	private async initializePending(): Promise<void> {
		while (!this.discordSdk || !this.user) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	public getHelper(): typeof Help | null {
		return this.helper;
	}

	/**
	 * Get the DiscordSDK instance
	 */
	public getSdk(): DiscordSDK {
		if (!this.discordSdk) {
			throw new Error(
				'DiscordSDK is not initialized. Call initialize() first.',
			);
		}
		return this.discordSdk;
	}

	/**
	 * Get the authenticated user
	 */
	public getUser(): CompatibleUser | null {
		return this.user;
	}

	/**
	 * Get the current state of the manager
	 */
	public getState(): JavaScriptListenerState {
		return this.state;
	}

	/**
	 * Send a message to the SDK
	 */
	public sendMessage<TPayload>(message: JSFFI_Message<TPayload>): void {
		if (!this.discordSdk) {
			throw new Error(
				'DiscordSDK is not initialized. Call initialize() first.',
			);
		}

		console.log('Sending message:', message);

		// Example: process message here, e.g., send it via the SDK
		switch (message.type) {
			case JavaScriptMessageType.Command:
				this.processCommandMessage(message as JSFFI_CommandMessage);
				break;

			case JavaScriptMessageType.Notification:
				this.processNotificationMessage(
					message as JSFFI_NotificationMessage,
				);
				break;

			default:
				console.warn('Unhandled message type:', message.type);
		}
	}

	private processCommandMessage(message: JSFFI_CommandMessage): void {
		console.log('Processing command:', message.payload.command);
		// Example: Use the SDK to process the command
	}

	private processNotificationMessage(
		message: JSFFI_NotificationMessage,
	): void {
		console.log('Notification received:', message.payload.message);
		// Example: Handle notifications as needed
	}
}

export default DiscordSDKManager;
