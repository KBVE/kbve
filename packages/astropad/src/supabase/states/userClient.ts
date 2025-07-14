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
  private static instance: UserClientService;

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
    if (!UserClientService.instance) {
      UserClientService.instance = new UserClientService();
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
   */
  public async syncUserBalance(identifier: string, useCache = true): Promise<void> {
    if (!identifier) {
      this.userBalanceAtom.set(undefined);
      return;
    }

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
   */
  public async initialize(): Promise<void> {
    await this.syncSupabaseUser();
    
    // Auto-sync balance if user is logged in
    const user = this.userAtom.get();
    if (user) {
      const identifier = this.usernameAtom.get() || user.email || user.id;
      if (identifier) {
        await this.syncUserBalance(identifier);
      }
    }
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