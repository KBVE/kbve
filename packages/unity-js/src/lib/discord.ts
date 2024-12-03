import { DiscordSDK } from '@discord/embedded-app-sdk';

import {
	DiscordConfigOptions,
	JSFFI_Message,
	JSFFI_AuthMessage,
	JSFFI_CommandMessage,
	JSFFI_NotificationMessage,
	JavaScriptListenerState,
	JavaScriptMessageType,
	CompatibleUser,
} from '../types';

class DiscordSDKManager {
	private static instance: DiscordSDKManager | null = null;
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

			const { user } = await this.discordSdk.commands.authenticate({
				access_token: tokenData.access_token,
			});

			this.user = user;
			this.state = JavaScriptListenerState.Authenticated;
		} catch (error) {
			this.state = JavaScriptListenerState.Error;
			console.error('Error initializing DiscordSDK:', error);
			throw error;
		}
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
