//  kilobase.ts
//  [IMPORTS]
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import Dexie from 'dexie';
import { atom, map } from 'nanostores';
import type { WritableAtom, MapStore } from 'nanostores';

import { persistentMap, persistentAtom } from '@nanostores/persistent';
import {
	UserProfile,
	ErrorLog,
	ActionULID,
	Persistable,
	AtlasData,
	UserRedirectEvent,
} from '../../types';
import KiloBaseState from '../constants';

import ULIDFactory from '../utils/ulid';
import { eventEmitterInstance } from '../eventhandler';

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
	bio: '',
};

// Nanostores for managing profile state
export const $profileStore = map<UserProfile>(defaultProfile); // Initialize with default profile
export const isSyncingStore = atom<boolean>(false); // Track synchronization state
export const syncActionStore = atom<string>(''); // Track syncActionStore state
export const $usernameStore = atom<string | null>(null); // Track username state

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
		this.initializeEventListeners();
	}

	// Add a method to initialize event listeners
	private initializeEventListeners() {
		eventEmitterInstance.on('redirectUser', this.handleUserRedirect);
	}

	public cleanupEventListeners() {
		// Remove the redirectUser listener when no longer needed
		eventEmitterInstance.off('redirectUser', this.handleUserRedirect);
	}

	/**
	 * Handle user redirection based on the UserRedirectEvent data.
	 * @param data - The UserRedirectEvent data containing URL and optional parameters.
	 */
	private handleUserRedirect = (data?: UserRedirectEvent) => {
		if (!data || !data.location) return;
	  
		const { location, timer = 0, replace = false } = data;
	  
		console.log(`Redirecting user to: ${location} in ${timer}ms`);
	  
		// Set a timeout if a delay is specified
	  // Use a setTimeout for delayed redirection, if `timer` is set
	  setTimeout(() => {
		// Perform the cleanup right before triggering the redirect
		this.cleanupEventListeners();
	
		// Perform the redirection using `replace` if specified
		if (replace) {
		  window.location.replace(location); // Replaces current history entry (no back navigation)
		} else {
		  window.location.href = location; // Standard redirect with back navigation support
		}
	  }, timer);
	};

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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
			if (profile.username) {
				$usernameStore.set(profile.username);
			}
			$profileStore.set(profile);
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
				$profileStore.set(localProfile.value as UserProfile);
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

			// Step 1: Get the authenticated user from Supabase
			const {
				data: { user },
				error: userError,
			} = await supabase.auth.getUser();

			if (userError) {
				console.error(
					'Failed to get authenticated user from Supabase:',
					userError,
				);
				await this.logError(
					'Failed to get authenticated user from Supabase',
					userError,
				);
				return;
			}

			if (!user) {
				console.warn('No authenticated user found');
				return;
			}

			// Step 2: Query the user profile from the public.user_profiles table
			const { data: profileData, error: profileError } = await supabase
				.from('user_profiles')
				.select('id, username, avatar_url, updated_at, bio')
				.eq('id', user.id)
				.single();

			if (profileError) {
				console.error(
					'Failed to load user profile from Supabase:',
					profileError,
				);
				await this.logError(
					'Failed to load user profile from Supabase',
					profileError,
				);
				return;
			}

			if (profileData) {
				const profile: UserProfile = {
					id: profileData.id,
					email: user.email || '', // Use the email from the authenticated user object
					username: profileData.username || undefined,
					fullName: user.user_metadata?.['full_name'] || undefined, // Use the full_name from user metadata if available
					avatar_url: profileData.avatar_url || undefined, // Include the avatar URL from the profile data
					bio: profileData.bio || undefined,
					updatedAt: new Date(profileData.updated_at),
				};

				// Save the profile locally in Dexie or any other local storage
				await this.saveProfile(profile);
				console.log('Profile loaded and saved from Supabase:', profile);
			}
		} catch (error) {
			console.error(
				'An unexpected error occurred while loading the profile:',
				error,
			);
			await this.logError(
				'An unexpected error occurred while loading the profile',
				error,
			);
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
			const profile = $profileStore.get();

			// Remove profile from local Dexie storage
			await this.table('keyValueStore').delete(this.profileKey);
			await this.profiles.delete(profile.id); // Remove from profiles table in Dexie

			// Reset the $profileStore to the default state
			$profileStore.set(defaultProfile);
			console.log(
				`Profile ${profile.id} removed locally and store reset`,
			);

			// Reset the userStore
			$usernameStore.set(null);

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
	 * Retrieve the user profile from the store or Dexie.
	 * If the profile is already in the store, it returns that value.
	 * If the store is empty, it queries Dexie for the profile and updates the store.
	 * If neither are available, returns the default profile.
	 * @returns The user profile if found, otherwise the default profile.
	 */
	async getProfile(): Promise<UserProfile> {
		// Check if the profile is already stored in the Nanostore
		const storedProfile = $profileStore.get();
		if (storedProfile.id !== '') {
			return storedProfile;
		}

		try {
			// Query the local Dexie database for the stored profile
			const profile = await this.table('keyValueStore').get(
				this.profileKey,
			);
			if (profile?.value) {
				const userProfile = profile.value as UserProfile;

				// Update the Nanostore with the profile and return it
				$profileStore.set(userProfile);
				return userProfile;
			}
		} catch (error) {
			console.error('Failed to get profile from Dexie:', error);
		}

		// Return the default profile if not found in the store or Dexie
		return defaultProfile;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

	/**
	 * Retrieve the username from the store or Dexie.
	 * If the username is already in the store, it returns that value.
	 * If the store is empty, it queries Dexie for the username and updates the store.
	 * @returns The username if found, otherwise null.
	 */
	async getUsername(): Promise<string | null> {
		// Check if the username is already stored in the Nanostore
		if ($usernameStore.get()) {
			return $usernameStore.get();
		}

		try {
			// Query the local Dexie database for the stored profile
			const profile = await this.table('keyValueStore').get(
				this.profileKey,
			);
			if (profile?.value?.username) {
				// Update the Nanostore with the username and return it
				$usernameStore.set(profile.value.username);
				return profile.value.username;
			}
		} catch (error) {
			console.error('Failed to get username from Dexie:', error);
		}

		// Return null if the username is not found in the store or Dexie
		return null;
	}

	/**
	 * Create a persistent atom with a given key and default value.
	 * Uses JSON.stringify and JSON.parse as default encoding and decoding mechanisms.
	 * @param key - The key to identify the persistentAtom in local storage.
	 * @param defaultValue - The default JSON value for the persistentAtom.
	 * @returns The created persistentAtom instance.
	 */
	static createPersistentAtom<T extends Persistable>(
		key: string,
		defaultValue: T,
	): WritableAtom<T> {
		return persistentAtom<T>(key, defaultValue, {
			encode: JSON.stringify,
			decode: JSON.parse,
		}) as WritableAtom<T>;
	}

	/**
	 * Create a persistent map with a given key and default value.
	 * Uses JSON.stringify and JSON.parse as default encoding and decoding mechanisms.
	 * @param key - The key to identify the persistentMap in local storage.
	 * @param defaultValue - The default JSON value for the persistentMap.
	 * @returns The created persistentMap instance.
	 */
	createPersistentMap<T extends Persistable>(
		key: string,
		defaultValue: T,
	): MapStore<T> {
		return persistentMap<T>(key, defaultValue, {
			encode: JSON.stringify,
			decode: JSON.parse,
		}) as unknown as MapStore<T>;
	}

	/**
	 * Update a field within a persistent atom using JSON manipulation.
	 * @param store - The persistent atom to update.
	 * @param key - The key within the JSON object to update.
	 * @param value - The new value for the specified key.
	 */
	updateAtomField<T extends Persistable>(
		store: WritableAtom<T>,
		key: keyof T,
		value: T[keyof T],
	) {
		store.set({
			...store.get(),
			[key]: value,
		});
	}

	/**
	 * Update a field within a persistent map by copying and replacing the map.
	 * @param store - The persistent map to update.
	 * @param key - The key within the JSON object to update.
	 * @param value - The new value for the specified key.
	 */
	updateMapField<T extends Persistable>(
		store: MapStore<T>,
		key: keyof T,
		value: T[keyof T],
	) {
		// Step 1: Get the current state of the map
		const currentState = store.get();

		// Step 2: Create a shallow copy of the current state
		const updatedState = { ...currentState, [key]: value };

		// Step 3: Replace the entire map with the updated state
		store.set(updatedState);
	}

	/**
	 * Remove a field from the persistent map by copying and replacing the map.
	 * @param store - The persistent map to update.
	 * @param key - The key within the JSON object to remove.
	 */
	removeMapField<T extends Persistable>(store: MapStore<T>, key: keyof T) {
		// Step 1: Get the current state of the map
		const currentState = store.get();

		// Step 2: Create a shallow copy of the current state and remove the specified key
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { [key]: _, ...updatedState } = currentState;

		// Step 3: Replace the entire map with the updated state
		store.set(updatedState as T);
	}

	/**
	 * Remove a field from the persistent atom using JSON manipulation.
	 * @param store - The persistent atom to update.
	 * @param key - The key to remove from the JSON object.
	 */
	removeAtomField<T extends Persistable>(
		store: WritableAtom<T>,
		key: keyof T,
	) {
		const currentState = store.get();
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { [key]: _, ...updatedState } = currentState;
		store.set(updatedState as T);
	}

	/**
	 * Reset the persistent atom or map to its default state.
	 * @param store - The persistent atom or map to reset.
	 * @param defaultState - The default state to set in the atom or map.
	 */
	resetState<T extends Persistable>(
		store: WritableAtom<T> | MapStore<T>,
		defaultState: T,
	) {
		store.set(defaultState);
	}

	/**
	 * Retrieve the value of a persistent atom.
	 * @param atomStore - The persistent atom store to get the value from.
	 * @returns The value of the persistent atom.
	 */
	getPersistentAtom<T extends Persistable>(atomStore: WritableAtom<T>): T {
		return atomStore.get();
	}
}

//
export const $atlas = Kilobase.createPersistentAtom<AtlasData>('atlas', {
	plugin: [],
});

// Create a Kilobase instance for global use
export const kilobase = new Kilobase();
