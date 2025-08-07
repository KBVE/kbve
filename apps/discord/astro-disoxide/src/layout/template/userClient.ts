import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

class UserClientService {
  // Atom to track readiness of the service
  public readonly userClientServiceReadyAtom = atom<boolean>(false);
  
  private static instance: UserClientService;
  private isInitialized = false;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  // Core user state atoms
  public readonly userAtom = atom<User | null>(null);
  public readonly userLoadingAtom = atom<boolean>(true);
  public readonly userErrorAtom = atom<string>("");

  // Persistent atoms for core user data
  public readonly userIdAtom = persistentAtom<string | undefined>('user:id', undefined);
  public readonly userEmailAtom = persistentAtom<string | undefined>('user:email', undefined);

  private constructor() {}

  public static getInstance(): UserClientService {
    // If running in browser and global already exists, use it
    let createdNew = false;
    if (typeof window !== 'undefined') {
      if ((window as any).userClientService) {
        UserClientService.instance = (window as any).userClientService;
      } else if (!UserClientService.instance) {
        UserClientService.instance = new UserClientService();
        (window as any).userClientService = UserClientService.instance;
        createdNew = true;
      }
    } else {
      if (!UserClientService.instance) {
        UserClientService.instance = new UserClientService();
        createdNew = true;
      }
    }
    // If a new instance was created, initialize it
    if (createdNew) {
      // Note: initialize() is async, but getInstance is sync. Fire and forget.
      UserClientService.instance.initialize();
    }
    return UserClientService.instance;
  }

  /**
   * Clear all user state
   */
  private clearUserState(): void {
    this.userAtom.set(null);
    this.userIdAtom.set(undefined);
    this.userEmailAtom.set(undefined);
  }

  /**
   * Sync user data with Supabase session
   */
  public async syncSupabaseUser(): Promise<void> {
    console.log('[UserClientService] Syncing Supabase user...');
    
    this.userLoadingAtom.set(true);
    this.userErrorAtom.set("");

    try {
      // First get the session to ensure we have a valid session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      console.log('[UserClientService] Session data:', sessionData);
      console.log('[UserClientService] Session error:', sessionError);
      
      if (sessionError) {
        throw sessionError;
      }

      // If we have a session, get the user data
      if (sessionData?.session) {
        console.log('[UserClientService] Valid session found, getting user...');
        const { data, error } = await supabase.auth.getUser();
        
        console.log('[UserClientService] User data:', data);
        console.log('[UserClientService] User error:', error);
        
        if (error) {
          throw error;
        }

        if (data?.user) {
          console.log('[UserClientService] Setting user:', data.user.email);
          this.userAtom.set(data.user);
          this.userIdAtom.set(data.user.id ?? undefined);
          this.userEmailAtom.set(data.user.email ?? undefined);
        } else {
          console.log('[UserClientService] No user data, clearing state');
          this.clearUserState();
        }
      } else {
        // No session, clear user state
        console.log('[UserClientService] No session found, clearing state');
        this.clearUserState();
      }
    } catch (error: any) {
      console.log('[UserClientService] Error syncing user:', error);
      this.userErrorAtom.set(error.message || 'Failed to sync user data');
      this.clearUserState();
    } finally {
      this.userLoadingAtom.set(false);
      console.log('[UserClientService] Sync completed, loading set to false');
    }
  }

  /**
   * Reset all user state
   */
  public resetState(): void {
    this.clearUserState();
    this.userLoadingAtom.set(true);
    this.userErrorAtom.set("");
  }

  /**
   * Initialize the service (call this when the app starts)
   * Safe to call multiple times - will only initialize once
   */
  public async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If currently initializing, return the existing promise
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.isInitializing = true;
    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
      this.isInitialized = true;
      this.userClientServiceReadyAtom.set(true); // Set ready atom after init
    } catch (error) {
      console.error('[UserClientService] Initialization failed:', error);
      // Reset flags so initialization can be retried
      this.isInitializing = false;
      this.initPromise = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Internal initialization logic
   */
  private async doInitialize(): Promise<void> {
    await this.syncSupabaseUser();
  }

  /**
   * Reset initialization state (useful for testing or re-initialization)
   */
  public resetInitialization(): void {
    this.isInitialized = false;
    this.isInitializing = false;
    this.initPromise = null;
  }

  /**
   * Sign out the current user
   */
  public async signOut(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      this.clearUserState();
    } catch (error: any) {
      console.error('[UserClientService] Sign out failed:', error);
      throw error;
    }
  }

  /**
   * Get current user (no Supabase call, from local atom)
   */
  public getCurrentUser(): User | null {
    return this.userAtom.get();
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.userAtom.get() !== null;
  }
}

export const userClientService = UserClientService.getInstance();

export const {
  userAtom,
  userLoadingAtom,
  userErrorAtom,
  userIdAtom,
  userEmailAtom
} = userClientService;