//  kilobase.ts
//  [IMPORTS]
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import Dexie from 'dexie';
import { atom, map } from 'nanostores';
import { UserProfile, ErrorLog, ActionULID } from '../../types';
import KiloBaseState from '../constants';

import ULIDFactory from '../utils/ulid';

// Method definitions, including:
// - initializeSupabaseClient
// - getSupabaseClient
// - registerUser
// - handleAuthError
// - logError
// - saveProfile
// - loadProfile
// - removeProfile

const defaultProfile: UserProfile = {
	id: '',
	email: '',
	updatedAt: new Date(),
	fullName: 'Guest',
	username: 'Guest',
};

// Nanostores for managing profile state
export const profileStore = map<UserProfile>(defaultProfile); // Initialize with default profile
export const isSyncingStore = atom<boolean>(false); // Track synchronization state
export const syncActionStore = atom<string>(''); // Track syncActionStore state

// Define the Kilobase class to wrap around Dexie and Supabase
export class Kilobase extends Dexie {
	profiles!: Dexie.Table<UserProfile, string>;
	errorLogs!: Dexie.Table<ErrorLog, number>;
	actionULID!: Dexie.Table<ActionULID, string>;
	private supabase: SupabaseClient | null = null;
	private profileKey = 'userProfile'; // Key for local storage

	constructor() {
		super('KilobaseDB');
		// Define Dexie tables for profiles and error logs
		this.version(1).stores({
			keyValueStore: 'key',
			profiles: '&id, email',
			errorLogs: '++id, actionId, message, timestamp', // Auto-incremented primary key
			actionULID: '&id, action, timestamp, status, errorId',
		});

		// Initialize tables
		this.profiles = this.table('profiles');
		this.errorLogs = this.table('errorLogs');
		this.actionULID = this.table('actionULID');

		this.supabase = this.initializeSupabaseClient();
	}

	/**
	 * Singleton pattern for the Supabase client.
	 * Ensures only one instance is created and shared across the application.
	 */
	private initializeSupabaseClient(): SupabaseClient {
		// Check if a global Supabase client instance is already available
		if (typeof window !== 'undefined' && window.supabase) {
			console.log(
				'Using global Supabase client instance:',
				window.supabase,
			);
			this.supabase = window.supabase as SupabaseClient;
		}

		// If the Supabase client is still not set, create a new instance
		if (!this.supabase) {
			try {
				this.supabase = createClient(
					KiloBaseState.get().api,
					KiloBaseState.get().anonKey,
				);
				console.log('Supabase client instance created:', this.supabase);

				// Set the created instance globally
				if (typeof window !== 'undefined') {
					window.supabase = this.supabase;
				}
			} catch (error) {
				console.error('Error creating Supabase client:', error);
				throw error;
			}
		}

		return this.supabase;
	}

	/**
	 * Get the Supabase client instance.
	 */
	getSupabaseClient() {
		return this.supabase;
	}

	/**
	 * Register a new user with Supabase.
	 * @param email - User's email address.
	 * @param password - User's password.
	 * @param confirm - User's password (to confirm).
	 * @param actionId - ID of the associated action to track this operation.
	 * @param username - User's optional username.
	 * @param captchaToken - Captcha token for verification.
	 */
	async registerUser(
		email: string,
		password: string,
		confirm: string,
		actionId: string,
		username?: string,
		captchaToken?: string,
	): Promise<UserProfile | null> {
		const supabase = this.getSupabaseClient();
		if (!supabase) return null;

		try {
			// Check if passwords match
			if (password !== confirm) {
				await this.handleAuthError(
					{ message: 'Password and confirm password do not match.' },
					actionId,
				);
				return null; // Optional: Remove if you don't want to return anything after error handling
			}

			// Proceed with registration if passwords match
			const { data, error } = await supabase.auth.signUp({
				email,
				password,
				options: {
					captchaToken,
					data: {
						username,
						full_name: username,
					},
				},
			});

			if (error) {
				// Use handleAuthError to log and throw the error
				await this.handleAuthError(error, actionId);
				return null;
			}

			if (data?.user) {
				const profile: UserProfile = {
					id: data.user.id,
					email: data.user.email || '',
					username:
						data.user.user_metadata?.['username'] || undefined,
					fullName:
						data.user.user_metadata?.['full_name'] || undefined,
					updatedAt: new Date(data.user.updated_at || Date.now()),
				};

				// Save profile locally
				await this.saveProfile(profile);
				await this.updateActionStatus(actionId, 'completed'); // Mark action as completed
				return profile;
			}
		} catch (err) {
			await this.handleAuthError(err, actionId);
			return null;
		}

		return null;
	}
	/**
	 * Create a new action entry in the ActionULID table.
	 * @param action - The name of the action, e.g., "registerUser".
	 * @returns The ID of the newly created action entry.
	 */
	async createActionULID(action: string): Promise<string> {
		const id = ULIDFactory().toString();
		const newAction: ActionULID = {
			id,
			action,
			timestamp: new Date(),
			status: 'pending',
		};
		await this.actionULID.add(newAction);
		return id;
	}

	/**
	 * Centralized error handling for authentication errors.
	 * @param error - The error object returned from Supabase.
	 * @param actionId - Optional ID of the associated action for logging purposes.
	 * @throws Throws the error after logging it.
	 */
	private async handleAuthError(
		error: any,
		actionId?: string,
	): Promise<void> {
		let errorMessage = 'An unknown error occurred. Please try again.';
		// eslint-disable-next-line prefer-const
		let errorDetails = { ...error }; // Copy error details to log
		let additionalInfo = '';

		// Supabase error format
		if (error?.message) {
			errorMessage = error.message;
		}

		// Extract more information if available
		if (error?.code) {
			additionalInfo += `Error Code: ${error.code}. `;
		}

		if (error?.status) {
			additionalInfo += `Status: ${error.status}. `;
		}

		if (error?.supabaseCode) {
			additionalInfo += `Supabase Code: ${error.supabaseCode}. `;
		}

		// You can add more fields here as needed
		if (error?.details) {
			additionalInfo += `Details: ${JSON.stringify(error.details)}. `;
		}

		// Append additional information to the error message
		if (additionalInfo) {
			errorMessage = `${errorMessage} (${additionalInfo.trim()})`;
		}

		// Additional error message customization based on specific codes or statuses
		const supabaseErrorMessages: Record<string, string> = {
			invalid_grant: 'Invalid credentials provided.',
			invalid_request: 'The request is missing a required parameter.',
			expired_token: 'The token has expired. Please log in again.',
			invalid_token: 'The token provided is invalid. Please try again.',
			email_already_exists: 'The email address is already in use.',
			user_already_exists:
				'A user with this identifier already exists. Please log in instead.',
			invalid_password: 'The password provided is incorrect.',
		};

		if (error?.code && supabaseErrorMessages[error.code]) {
			errorMessage = supabaseErrorMessages[error.code];
		}

		// Append more information based on HTTP status
		switch (error?.status) {
			case 400:
				errorMessage = 'Bad request. Please check the input fields.';
				break;
			case 401:
				errorMessage = 'Unauthorized. Please check your credentials.';
				break;
			case 403:
				errorMessage =
					'Forbidden. You do not have permission to perform this action.';
				break;
			case 404:
				errorMessage = 'Resource not found. Please try again.';
				break;
			case 422:
				errorMessage =
					'Unprocessable entity. Please check the provided data.';
				break;
			case 500:
				errorMessage = 'Internal server error. Please try again later.';
				break;
			default:
				errorMessage =
					errorMessage ||
					'An unknown error occurred. Please try again.';
				break;
		}

		// Log the error in Dexie errorLogs table only if an error doesn't already exist for the actionId
		await this.logError(
			errorMessage,
			{
				...errorDetails,
				supabaseCode: error?.code,
				statusCode: error?.status,
			},
			actionId,
		);

		// Log to the console for debugging purposes
		console.error('Authentication Error:', errorMessage);

		// Throw the error to let the caller handle it
		throw new Error(errorMessage);
	}

	/**
	 * Save a user profile locally and update the nanostore.
	 */
	async saveProfile(profile: UserProfile) {
		try {
			await this.table('keyValueStore').put({
				key: this.profileKey,
				value: profile,
			});
			profileStore.set(profile);
			console.log('Profile saved locally:', profile);
		} catch (error) {
			console.error('Failed to save profile locally:', error);
		}
	}

	/**
	 * Load profile from local storage (Dexie) or Supabase if not available locally.
	 */
	async loadProfile() {
		try {
			const localProfile = await this.table('keyValueStore').get(
				this.profileKey,
			);
			if (localProfile?.value) {
				profileStore.set(localProfile.value as UserProfile);
				console.log(
					'Profile loaded from local storage:',
					localProfile.value,
				);
				return;
			}

			// If not available locally, load from Supabase
			await this.loadProfileFromSupabase();
		} catch (error) {
			console.error('Failed to load profile:', error);
		}
	}

	/**
	 * Load the user profile from Supabase and save it locally.
	 */
	async loadProfileFromSupabase(): Promise<void> {
		const supabase = this.getSupabaseClient();
		if (!supabase) return;

		try {
			isSyncingStore.set(true); // Set the syncing state to true

			// Query the profile data from Supabase
			const { data, error } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', profileStore.get().id) // Use the current profile ID in the store to get the profile
				.single();

			if (error) {
				console.error('Failed to load profile from Supabase:', error);
				await this.logError(
					'Failed to load profile from Supabase',
					error,
				);
				return;
			}

			if (data) {
				const profile: UserProfile = {
					id: data.id,
					email: data.email,
					username: data.username || undefined,
					fullName: data.full_name || undefined,
					updatedAt: new Date(data.updated_at),
				};

				// Save the profile locally in Dexie
				await this.saveProfile(profile);
				console.log('Profile loaded and saved from Supabase:', profile);
			}
		} finally {
			isSyncingStore.set(false); // Reset the syncing state
		}
	}

	/**
	 * Remove the user profile from both local storage (Dexie)
	 */
	async removeProfile(): Promise<void> {
		const supabase = this.getSupabaseClient();
		if (!supabase) return;

		try {
			const profile = profileStore.get();

			// Remove profile from local Dexie storage
			await this.table('keyValueStore').delete(this.profileKey);
			await this.profiles.delete(profile.id); // Remove from profiles table in Dexie

			// Reset the profileStore to the default state
			profileStore.set(defaultProfile);
			console.log(
				`Profile ${profile.id} removed locally and store reset`,
			);

			// Log the user out from Supabase
			const { error } = await supabase.auth.signOut();
			if (error) {
				await this.logError(
					'Failed to log out user from Supabase',
					error,
				);
				console.error('Failed to log out user from Supabase:', error);
			} else {
				console.log('User logged out successfully from Supabase.');
			}
		} catch (error) {
			await this.logError('Failed to remove profile', error);
			console.error('Failed to remove profile:', error);
		}
	}

	/**
	 * Create a new action entry in the ActionULID table.
	 * @param action - The name of the action, e.g., "registerUser".
	 * @returns The newly created ActionULID entry.
	 */
	async createAction(action: string): Promise<ActionULID> {
		const id = ULIDFactory().toString();
		const newAction: ActionULID = {
			id,
			action,
			timestamp: new Date(),
			status: 'pending',
		};

		await this.actionULID.add(newAction);
		return newAction;
	}

	/**
	 * Update the status of an existing action.
	 * @param actionId - The unique ID of the action to update.
	 * @param status - The new status of the action.
	 * @param errorId - Optional reference to an error ID if the action failed.
	 */
	async updateActionStatus(
		actionId: string,
		status: 'pending' | 'completed' | 'failed',
		errorId?: number,
	) {
		await this.actionULID.update(actionId, { status, errorId });
	}

	/**
	 * Log an error and associate it with an action.
	 * If an error already exists for the given actionId, terminate without logging.
	 * @param message - The error message.
	 * @param details - Optional error details including Supabase code and status.
	 * @param actionId - The action ULID to associate with the error.
	 */
	async logError(message: string, details?: any, actionId?: string) {
		try {
			// Check if an error already exists for the given actionId
			let existingError = null;
			if (actionId) {
				existingError = await this.errorLogs
					.where('actionId')
					.equals(actionId)
					.first();
			}

			// If an error already exists for this action, terminate without logging
			if (existingError) {
				console.warn(
					`Error already exists for actionId: ${actionId}. Skipping new error log.`,
				);
				return;
			}

			// Create a new error log entry since no existing error was found
			const errorLog: ErrorLog = {
				message,
				details,
				actionId, // Associate the error with the action
				timestamp: new Date(),
			};
			const errorId = await this.errorLogs.add(errorLog);
			console.log('Error logged to Dexie:', errorLog);

			// If there's an associated action, update its status to 'failed' and reference the error ID
			if (actionId) {
				await this.updateActionStatus(actionId, 'failed', errorId);
			}
		} catch (logError) {
			console.error('Failed to log error:', logError);
		}
	}

	/**
	 * Helper function to extract detailed information from the auth error object.
	 * @param error - The error object to extract details from.
	 * @returns A string with detailed error information.
	 */
	async extractAuthErrorDetails(error: any): Promise<string> {
		if (!error)
			return 'Unknown error occurred. No error details available.';

		let errorMessage = error.message || 'Unknown error occurred';
		let additionalInfo = '';

		// Extract various fields if they exist
		if (error?.code) {
			additionalInfo += `Error Code: ${error.code}. `;
		}

		if (error?.status) {
			additionalInfo += `Status: ${error.status}. `;
		}

		if (error?.supabaseCode) {
			additionalInfo += `Supabase Code: ${error.supabaseCode}. `;
		}

		if (error?.details) {
			additionalInfo += `Details: ${JSON.stringify(error.details)}. `;
		}

		// Append additional information to the main error message
		if (additionalInfo) {
			errorMessage = `${errorMessage} (${additionalInfo.trim()})`;
		}

		return errorMessage;
	}

	/**
	 * Get the detailed error message associated with a specific action ID.
	 * @param actionId - The action ID to filter error logs.
	 * @returns The detailed error message for the action, or null if no error is found.
	 */
	async getDetailedErrorByActionId(actionId: string): Promise<string | null> {
		try {
			// Get the most recent error for the specified action ID
			const latestError = await this.errorLogs
				.where('actionId')
				.equals(actionId)
				.last(); // Retrieve the latest error

			// Return detailed error information using the helper function
			return latestError
				? this.extractAuthErrorDetails(latestError)
				: null;
		} catch (error) {
			console.error(
				`Failed to retrieve detailed error for actionId: ${actionId}`,
				error,
			);
			return null;
		}
	}

	/**
	 * Get the latest error message associated with a specific action ID.
	 * @param actionId - The action ID to filter error logs.
	 * @returns The most recent error message for the action, or null if no error is found.
	 */
	async getErrorByActionId(actionId: string): Promise<string | null> {
		try {
			// Get the most recent error for the specified action ID
			const latestError = await this.errorLogs
				.where('actionId')
				.equals(actionId)
				.last(); // Retrieve the latest error

			return latestError ? latestError.message : null;
		} catch (error) {
			console.error(
				`Failed to retrieve error for actionId: ${actionId}`,
				error,
			);
			return null;
		}
	}

	/**
	 * Login a user with Supabase.
	 * @param email - User's email address.
	 * @param password - User's password.
	 * @param actionId - Action ID for error tracking.
	 * @param captchaToken - Captcha token for verification.
	 * @returns UserProfile if login is successful, or null if an error occurs.
	 */
	async loginUser(
		email: string,
		password: string,
		actionId: string,
		captchaToken?: string,
	): Promise<UserProfile | null> {
		const supabase = this.getSupabaseClient();
		if (!supabase) return null;

		try {
			// Clear previous error state
			//authErrorStore.set(null);

			// Perform the login with captcha token if provided
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password,
				options: {
					captchaToken, // Include captcha token in login request
				},
			});

			// Handle any errors
			if (error) {
				await this.handleAuthError(error, actionId);
				return null;
			}

			// Check if the user object is returned
			if (data?.user) {
				const profile: UserProfile = {
					id: data.user.id,
					email: data.user.email || '',
					username:
						data.user.user_metadata?.['username'] || undefined,
					fullName:
						data.user.user_metadata?.['full_name'] || undefined,
					updatedAt: new Date(data.user.updated_at || Date.now()),
				};

				// Save profile locally
				await this.saveProfile(profile);
				console.log('User logged in successfully:', profile);

				return profile;
			}
		} catch (err) {
			await this.handleAuthError(err, actionId);
			return null;
		}

		return null;
	}

	/**
	 * Retrieve the current Supabase session.
	 * This function abstracts away the session retrieval logic for easy reuse.
	 * @returns The active session data, or null if no session is present.
	 */
	async getSession(): Promise<Session | null> {
		const supabase = this.getSupabaseClient();
		if (!supabase) return null;

		try {
			const { data, error } = await supabase.auth.getSession();
			if (error) {
				console.error('Failed to retrieve session:', error);
				return null;
			}
			return data.session || null; // Return the session if it exists, or null if not
		} catch (err) {
			console.error('Error getting session:', err);
			return null;
		}
	}
}

// Create a Kilobase instance for global use
export const kilobase = new Kilobase();
