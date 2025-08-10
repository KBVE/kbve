import { atom } from 'nanostores';
import { supabase, userClientService } from '@kbve/astropad';
import type { User } from '@supabase/supabase-js';

// Type definitions specific to profile management
export type ProfileFormData = {
  email: string;
  phone: string;
  displayName: string;
  username: string;
};

class UserProfileService {
  private static instance: UserProfileService;

  // Profile management atoms (specific to this service)
  public readonly profileUpdateLoadingAtom = atom<boolean>(false);
  public readonly profileUpdateErrorAtom = atom<string>("");
  public readonly profileUpdateSuccessAtom = atom<string>("");

  // Username registration atoms (specific to this service)
  public readonly usernameRegistrationLoadingAtom = atom<boolean>(false);
  public readonly usernameRegistrationErrorAtom = atom<string>("");
  public readonly usernameRegistrationSuccessAtom = atom<string>("");

  // Email verification atoms (specific to this service)
  public readonly emailVerificationLoadingAtom = atom<boolean>(false);
  public readonly emailVerificationErrorAtom = atom<string>("");
  public readonly emailVerificationSuccessAtom = atom<string>("");

  private constructor() {}

  public static getInstance(): UserProfileService {
    if (!UserProfileService.instance) {
      UserProfileService.instance = new UserProfileService();
    }
    return UserProfileService.instance;
  }

  private clearMessages(): void {
    this.profileUpdateErrorAtom.set("");
    this.profileUpdateSuccessAtom.set("");
    this.usernameRegistrationErrorAtom.set("");
    this.usernameRegistrationSuccessAtom.set("");
    this.emailVerificationErrorAtom.set("");
    this.emailVerificationSuccessAtom.set("");
  }

  /**
   * Sync user data with Supabase session (delegates to userClientService)
   */
  public async syncSupabaseUser(): Promise<void> {
    await userClientService.syncSupabaseUser();
  }

  /**
   * Fetch and sync user balance from Supabase (delegates to userClientService)
   */
  public async syncUserBalance(identifier: string, useCache = true): Promise<void> {
    await userClientService.syncUserBalance(identifier, useCache);
  }

  /**
   * Get username from user ID using Supabase RPC (delegates to userClientService)
   */
  public async getUsernameByUuid(uuid: string): Promise<string | null> {
    return await userClientService.getUsernameByUuid(uuid);
  }

  /**
   * Get user ID from username using Supabase RPC (delegates to userClientService)
   */
  public async getUuidByUsername(username: string): Promise<string | null> {
    return await userClientService.getUuidByUsername(username);
  }

  /**
   * Update user profile information
   */
  public async updateUserProfile(formData: Partial<ProfileFormData>): Promise<void> {
    const user = userClientService.userAtom.get();
    if (!user) {
      this.profileUpdateErrorAtom.set("User not logged in");
      return;
    }

    this.profileUpdateLoadingAtom.set(true);
    this.clearMessages();

    try {
      // Prepare update data
      const updateData: any = {};
      
      // Only include fields that have changed
      if (formData.email && formData.email !== (user.email || '')) {
        updateData.email = formData.email;
      }
      
      if (formData.phone && formData.phone !== (user.phone || '')) {
        updateData.phone = formData.phone;
      }

      // Update user_metadata
      const userData: any = {};
      if (formData.displayName && formData.displayName !== (user.user_metadata?.display_name || '')) {
        userData.display_name = formData.displayName;
      }
      if (formData.username && formData.username !== (user.user_metadata?.username || '')) {
        userData.username = formData.username;
      }

      if (Object.keys(userData).length > 0) {
        updateData.data = userData;
      }

      // Only proceed if there are changes
      if (Object.keys(updateData).length === 0) {
        this.profileUpdateErrorAtom.set('No changes to save.');
        return;
      }

      const { error } = await supabase.auth.updateUser(updateData);

      if (error) {
        this.profileUpdateErrorAtom.set(`Failed to update profile: ${error.message}`);
      } else {
        this.profileUpdateSuccessAtom.set('Profile updated successfully!');
        // Sync user data to update the store
        await this.syncSupabaseUser();
      }
    } catch (error: any) {
      this.profileUpdateErrorAtom.set('An unexpected error occurred while updating your profile.');
    } finally {
      this.profileUpdateLoadingAtom.set(false);
    }
  }

  /**
   * Register a username for the user
   */
  public async registerUsername(username: string): Promise<void> {
    const user = userClientService.userAtom.get();
    if (!user) {
      this.usernameRegistrationErrorAtom.set('User not logged in.');
      return;
    }

    // Validate username format
    const USERNAME_REGEX = /^[a-z0-9_-]{3,30}$/;
    if (!USERNAME_REGEX.test(username)) {
      this.usernameRegistrationErrorAtom.set('Username must be 3-30 characters, lowercase letters, numbers, _ or -');
      return;
    }

    this.usernameRegistrationLoadingAtom.set(true);
    this.clearMessages();

    try {
      const { data, error } = await supabase.functions.invoke('register-user', {
        body: { username: username.toLowerCase() }
      });

      if (error) {
        this.usernameRegistrationErrorAtom.set(error.message || 'Registration failed.');
      } else {
        this.usernameRegistrationSuccessAtom.set('Username registered successfully!');
        userClientService.usernameAtom.set(username);
        userClientService.userNamePersistentAtom.set(username);
      }
    } catch (error: any) {
      this.usernameRegistrationErrorAtom.set('Network error occurred during registration.');
    } finally {
      this.usernameRegistrationLoadingAtom.set(false);
    }
  }

  /**
   * Resend email verification
   */
  public async resendEmailVerification(): Promise<void> {
    const user = userClientService.userAtom.get();
    if (!user?.email) {
      this.emailVerificationErrorAtom.set('No email address found');
      return;
    }

    this.emailVerificationLoadingAtom.set(true);
    this.clearMessages();

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email
      });

      if (error) {
        this.emailVerificationErrorAtom.set('Failed to resend verification email: ' + error.message);
      } else {
        this.emailVerificationSuccessAtom.set('Verification email sent! Please check your inbox.');
      }
    } catch (error: any) {
      this.emailVerificationErrorAtom.set('An unexpected error occurred.');
    } finally {
      this.emailVerificationLoadingAtom.set(false);
    }
  }

  /**
   * Link an identity to the current user account
   */
  public async linkIdentity(provider: 'github' | 'google' | 'discord'): Promise<void> {
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: provider
      });

      if (error) {
        this.profileUpdateErrorAtom.set(`Failed to link ${provider}: ${error.message}`);
      } else {
        this.profileUpdateSuccessAtom.set(`Successfully linked ${provider} account!`);
        // Sync user data to update the store
        await this.syncSupabaseUser();
      }
    } catch (error: any) {
      this.profileUpdateErrorAtom.set(`An error occurred while linking ${provider}.`);
    }
  }

  /**
   * Get user display name based on different auth providers
   */
  public getUserDisplayName(user?: User | null): string {
    const currentUser = user || userClientService.userAtom.get();
    if (!currentUser) return 'User';

    // Handle different auth providers for display name
    if (currentUser.user_metadata?.display_name) {
      return currentUser.user_metadata.display_name;
    }
    if (currentUser.user_metadata?.username) {
      return currentUser.user_metadata.username;
    }
    if (currentUser.email) {
      return currentUser.email;
    }
    // Handle Solana Web3 authentication
    if (currentUser.user_metadata?.custom_claims?.chain === 'solana' && currentUser.user_metadata?.custom_claims?.address) {
      const address = currentUser.user_metadata.custom_claims.address;
      // Show shortened wallet address for better UX
      return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }
    return 'User';
  }

  /**
   * Get avatar URL from user metadata
   */
  public getUserAvatarUrl(user?: User | null): string | null {
    const currentUser = user || userClientService.userAtom.get();
    if (!currentUser) return null;

    return currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;
  }

  /**
   * Check if user is a valid Web3 user
   */
  public isWeb3User(user?: User | null): boolean {
    const currentUser = user || userClientService.userAtom.get();
    if (!currentUser) return false;

    return currentUser.app_metadata?.provider === 'web3' && 
           !!currentUser.user_metadata?.custom_claims?.address;
  }

  /**
   * Get Web3 wallet address
   */
  public getWeb3WalletAddress(user?: User | null): string | null {
    const currentUser = user || userClientService.userAtom.get();
    if (!currentUser || !this.isWeb3User(currentUser)) return null;

    return currentUser.user_metadata?.custom_claims?.address || null;
  }

  /**
   * Check if user has a valid username
   */
  public hasValidUsername(user?: User | null): boolean {
    const currentUser = user || userClientService.userAtom.get();
    const username = userClientService.usernameAtom.get() || currentUser?.user_metadata?.username;
    
    const USERNAME_REGEX = /^[a-z0-9_-]{3,30}$/;
    return typeof username === 'string' && USERNAME_REGEX.test(username);
  }

  /**
   * Reset all stated
   */
  public resetState(): void {
    this.clearMessages();
    this.profileUpdateLoadingAtom.set(false);
    this.usernameRegistrationLoadingAtom.set(false);
    this.emailVerificationLoadingAtom.set(false);
  }

  /**
   * Initialize the service (call this when the app starts)
   */
  public async initialize(): Promise<void> {
    await this.syncSupabaseUser();
    
    // Auto-sync balance if user is logged in
    const user = userClientService.userAtom.get();
    if (user) {
      const identifier = userClientService.usernameAtom.get() || user.email || user.id;
      if (identifier) {
        await this.syncUserBalance(identifier);
      }
    }
  }
}

// Export singleton instance
export const userProfileService = UserProfileService.getInstance();