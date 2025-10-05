import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@kbve/astropad';

// Type for user balance view
export type UserBalanceView = {
  user_id: string;        // UUID
  username: string | null;
  role: string | null;
  credits: number | null;
  khash: number | null;
  level: number | null;
  created_at: string;     // ISO 8601 timestamp
};

class UserClientService {
  // Atom to track readiness of the service
  public readonly userClientServiceReadyAtom = atom<boolean>(false);
  /**
   * Get the current username from local atom (no Supabase call)
   */
  public getCurrentUsername(): string | null {
    return this.usernameAtom.get();
  }
  private static instance: UserClientService;
  private isInitialized = false;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  // Core user state atoms
  public readonly userAtom = atom<User | null>(null);
  public readonly usernameAtom = atom<string | null>(null);
  public readonly userLoadingAtom = atom<boolean>(true);
  public readonly userErrorAtom = atom<string>("");

  // Persistent atoms for core user data
  public readonly userIdAtom = persistentAtom<string | undefined>('user:id', undefined);
  public readonly userEmailAtom = persistentAtom<string | undefined>('user:email', undefined);
  public readonly userNamePersistentAtom = persistentAtom<string | undefined>('user:username', undefined);

  // User balance persistent atom
  public readonly userBalanceAtom = persistentAtom<UserBalanceView | undefined>(
    'user:balance',
    undefined,
    {
      encode: (value: UserBalanceView | undefined): string => {
        return value ? JSON.stringify(value) : "";
      },
      decode: (value: string | undefined): UserBalanceView | undefined => {
        return value ? JSON.parse(value) as UserBalanceView : undefined;
      },
    }
  );

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
    this.usernameAtom.set(null);
    this.userNamePersistentAtom.set(undefined);
    this.userBalanceAtom.set(undefined);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('isMember', 'false');
    }
  }

  /**
   * Sync user data with Supabase session
   */
  public async syncSupabaseUser(): Promise<void> {
    
    console.log('[AstroPad] Supabase Sync Called');
    
    this.userLoadingAtom.set(true);
    this.userErrorAtom.set("");

    try {
      const { data, error } = await supabase.auth.getUser();
      
      if (error) {
        throw error;
      }

      // Set default member status in localStorage if needed
      if (typeof window !== 'undefined') {
        if (localStorage.getItem('isMember') === null) {
          localStorage.setItem('isMember', 'false');
        }
      }

      if (data?.user) {
        this.userAtom.set(data.user);
        this.userIdAtom.set(data.user.id ?? undefined);
        this.userEmailAtom.set(data.user.email ?? undefined);
        
        // Handle username extraction for different auth providers
        let username: string | undefined;
        
        // First, try to get username from user_metadata (traditional OAuth)
        username = data.user.user_metadata?.username;
        
        // If no username found, check for Web3/Solana authentication
        if (!username && data.user.user_metadata?.custom_claims) {
          const customClaims = data.user.user_metadata.custom_claims;
          
          // For Solana Web3 auth, use the wallet address as identifier
          if (customClaims.chain === 'solana' && customClaims.address) {
            username = customClaims.address;
          }
          // Can extend for other Web3 chains in the future
          // else if (customClaims.chain === 'ethereum' && customClaims.address) {
          //   username = customClaims.address;
          // }
        }
        
        // Set the username atoms
        this.usernameAtom.set(username ?? null);
        this.userNamePersistentAtom.set(username);
        
        if (typeof window !== 'undefined') {
          localStorage.setItem('isMember', 'true');
        }
      } else {
        this.clearUserState();
      }
    } catch (error: any) {
      this.userErrorAtom.set(error.message || 'Failed to sync user data');
      this.clearUserState();
    } finally {
      this.userLoadingAtom.set(false);
    }
  }

  /**
   * Fetch and sync user balance from Supabase
   * NOTE: Temporarily disabled - RPC function removed from backend
   */
  public async syncUserBalance(identifier: string, useCache = true): Promise<void> {
    if (!identifier) {
      this.userBalanceAtom.set(undefined);
      return;
    }

    // TODO: Re-enable when get_user_balance_context RPC is restored
    // Commenting out to prevent CORS errors blocking auth flow
    /*
    try {
      const { data, error } = await supabase.rpc('get_user_balance_context', {
        p_identifier: identifier,
        use_cache: useCache,
      });

      if (data && data.length > 0 && !error) {
        this.userBalanceAtom.set(data[0] as UserBalanceView);
      } else {
        console.error('[syncUserBalance] Failed to fetch balance:', error?.message);
        this.userBalanceAtom.set(undefined);
      }
    } catch (error: any) {
      console.error('[syncUserBalance] Error:', error.message);
      this.userBalanceAtom.set(undefined);
    }
    */

    // Set to undefined for now
    this.userBalanceAtom.set(undefined);
  }

  /**
   * Get username from user ID using Supabase RPC
   * TODO: Move into IndexedDB for caching
   */
  public async getUsernameByUuid(uuid: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('proxy_get_username', { p_user_id: uuid });
      if (error) {
        console.error('[getUsernameByUuid] Failed to fetch username:', error.message);
        return null;
      }
      return data;
    } catch (error: any) {
      console.error('[getUsernameByUuid] Error:', error.message);
      return null;
    }
  }

  /**
   * Get user ID from username using Supabase RPC
   * TODO: Move into IndexedDB for caching
   */
  public async getUuidByUsername(username: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('proxy_get_uuid', { p_username: username });
      if (error) {
        console.error('[getUuidByUsername] Failed to fetch UUID:', error.message);
        return null;
      }
      return data;
    } catch (error: any) {
      console.error('[getUuidByUsername] Error:', error.message);
      return null;
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

    // Auto-sync balance if user is logged in
    // TODO: Re-enable when get_user_balance_context RPC is restored
    /*
    const user = this.userAtom.get();
    if (user) {
      const identifier = this.usernameAtom.get() || user.email || user.id;
      if (identifier) {
        await this.syncUserBalance(identifier);
      }
    }
    */
  }

  /**
   * Reset initialization state (useful for testing or re-initialization)
   */
  public resetInitialization(): void {
    this.isInitialized = false;
    this.isInitializing = false;
    this.initPromise = null;
  }
}

// Export singleton instance
export const userClientService = UserClientService.getInstance();

// For backward compatibility and convenience, also export the atoms directly
export const {
  userAtom,
  usernameAtom,
  userLoadingAtom,
  userErrorAtom,
  userIdAtom,
  userEmailAtom,
  userNamePersistentAtom,
  userBalanceAtom
} = userClientService;