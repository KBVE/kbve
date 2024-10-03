//  kilobase.ts
//  [IMPORTS]
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Dexie from 'dexie';
import { atom, map } from 'nanostores';
import { UserProfile, ErrorLog } from '../../types';
import KiloBaseState from '../constants';

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

// Define the Kilobase class to wrap around Dexie and Supabase
export class Kilobase extends Dexie {
	profiles!: Dexie.Table<UserProfile, string>;
	errorLogs!: Dexie.Table<ErrorLog, number>;
	private supabase: SupabaseClient | null = null;
	private profileKey = 'userProfile'; // Key for local storage

	constructor() {
		super('KilobaseDB');
		// Define Dexie tables for profiles and error logs
		this.version(1).stores({
			keyValueStore: 'key',
			profiles: '&id, email',
			errorLogs: '++id, message, timestamp', // Auto-incremented primary key
		});

		// Initialize tables
		this.profiles = this.table('profiles');
		this.errorLogs = this.table('errorLogs');

		this.supabase = this.initializeSupabaseClient();
	}

	/**
	 * Initializes the Supabase client and returns the instance.
	 * If already initialized, it returns the existing instance.
	 */
	private initializeSupabaseClient() {
		if (!this.supabase) {
			try {
				this.supabase = createClient(
					KiloBaseState.get().api,
					KiloBaseState.get().anonKey,
				);
				console.log('Supabase client instance created:', this.supabase);
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
	 * @param username - User's optional username.
	 * @param captchaToken - Captcha token for verification.
	 */
	async registerUser(
		email: string,
		password: string,
		confirm: string,
		username?: string,
		captchaToken?: string,
	): Promise<UserProfile | null> {
		const supabase = this.getSupabaseClient();
		if (!supabase) return null;

		try {
			// Password confirmation check
			if (password !== confirm) {
				const errorMessage =
					'Password and confirm password do not match.';
				await this.logError(errorMessage);
				throw new Error(errorMessage);
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
				this.handleAuthError(error);
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
				console.log('User registered successfully:', profile);

				return profile;
			}
		} catch (err) {
			this.handleAuthError(err);
		}

		return null;
	}

	/**
	 * Centralized error handling for authentication errors.
	 * @param error - The error object returned from Supabase.
	 */
	private async handleAuthError(error: any) {
		let errorMessage = 'An unknown error occurred. Please try again.';

		// Supabase error format
		if (error?.message) {
			errorMessage = error.message;
		}

		// Additional error cases can be added here as needed
		switch (error.status) {
			case 400:
				errorMessage = 'Bad request. Please check the input fields.';
				break;
			case 401:
				errorMessage = 'Unauthorized. Please check your credentials.';
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

		// Log error in Dexie errorLogs table
		await this.logError(errorMessage, error);

		console.error('Authentication Error:', errorMessage);
	}

	/**
	 * Log an error in the Dexie errorLogs table.
	 * @param message - The error message.
	 * @param details - Optional error details.
	 */
	async logError(message: string, details?: any) {
		try {
			const errorLog: ErrorLog = {
				message,
				details,
				timestamp: new Date(),
			};
			await this.errorLogs.add(errorLog);
			console.log('Error logged to Dexie:', errorLog);
		} catch (logError) {
			console.error('Failed to log error:', logError);
		}
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
}

// Create a Kilobase instance for global use
export const kilobase = new Kilobase();
