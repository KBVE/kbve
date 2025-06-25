import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { User } from '@supabase/supabase-js';
import { supabase } from 'src/layouts/core/supabaseClient';

// Holds the current user (null if not logged in)
export const userAtom = atom<User | null>(null);

// Atom for the username (null if not set)
export const usernameAtom = atom<string | null>(null);

// Persistent atoms for user id, email, and username
export const userIdAtom = persistentAtom<string | undefined>('meme:user:id', undefined);
export const userEmailAtom = persistentAtom<string | undefined>('meme:user:email', undefined);
export const userNamePersistentAtom = persistentAtom<string | undefined>('meme:user:username', undefined);

// Loading and error states
export const userLoadingAtom = atom<boolean>(true);
export const userErrorAtom = atom<string>("");

// Type for user meme profile view (equivalent to UserBalanceView in astro-kbve)
export type UserMemeProfile = {
  user_id: string;        // UUID
  username: string | null;
  role: string | null;
  credits: number | null;        // User credits from RPC
  khash: number | null;          // User khash from RPC
  meme_points: number | null;    // Meme-specific points
  level: number | null;
  total_memes: number | null;    // Number of memes created
  total_likes: number | null;    // Number of likes received
  created_at: string;     // ISO 8601 timestamp
};

// Persistent atom for user meme profile
function serializeUserMemeProfile(value: UserMemeProfile | undefined): string {
  return value ? JSON.stringify(value) : "";
}

function deserializeUserMemeProfile(value: string | undefined): UserMemeProfile | undefined {
  return value ? JSON.parse(value) as UserMemeProfile : undefined;
}

export const userMemeProfileAtom = persistentAtom<UserMemeProfile | undefined>(
  'meme:user:profile',
  undefined,
  {
    encode: serializeUserMemeProfile,
    decode: deserializeUserMemeProfile,
  }
);

// Utility function to sync userAtom and persistent atoms with supabase session
export async function syncSupabaseUser() {
  try {
    // Get the current user from Supabase
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('[syncSupabaseUser] Error getting user:', error);
      clearUserState();
      return;
    }

    if (user) {
      // Set user atoms
      userAtom.set(user);
      userIdAtom.set(user.id);
      userEmailAtom.set(user.email || undefined);
      
      // Get username from user metadata or persistent storage
      const metadataUsername = user.user_metadata?.username;
      const persistentUsername = userNamePersistentAtom.get();
      const username = metadataUsername || persistentUsername;
      
      if (username) {
        usernameAtom.set(username);
        userNamePersistentAtom.set(username);
        
        // Update localStorage for backward compatibility
        localStorage.setItem('memeUsername', username);
        localStorage.setItem('memeUserId', user.id);
        localStorage.setItem('memeUserEmail', user.email || '');
        localStorage.setItem('isMember', 'true');
        
        // Sync the user profile from RPC
        await syncUserMemeProfile(user.id);
      } else {
        // User exists but no username set - needs onboarding
        usernameAtom.set(null);
        userNamePersistentAtom.set(undefined);
      }
    } else {
      // No user logged in
      clearUserState();
    }
  } catch (error) {
    console.error('[syncSupabaseUser] Unexpected error:', error);
    clearUserState();
  }
}

// Helper function to clear all user state
function clearUserState() {
  userAtom.set(null);
  userIdAtom.set(undefined);
  userEmailAtom.set(undefined);
  usernameAtom.set(null);
  userNamePersistentAtom.set(undefined);
  userMemeProfileAtom.set(undefined);
  
  // Clear localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('memeUsername');
    localStorage.removeItem('memeUserId');
    localStorage.removeItem('memeUserEmail');
    localStorage.removeItem('onboardingComplete');
    localStorage.setItem('isMember', 'false');
  }
}

// Function to fetch and sync user meme profile from Supabase RPC
export async function syncUserMemeProfile(identifier: string, useCache = true) {
  if (!identifier) {
    userMemeProfileAtom.set(undefined);
    return;
  }

  try {
    // Make the actual RPC call to get user profile data
    const { data, error } = await supabase.rpc('get_user_meme_profile', {
      p_identifier: identifier,
      use_cache: useCache,
    });

    if (error) {
      console.error('[syncUserMemeProfile] RPC error:', error);
      userMemeProfileAtom.set(undefined);
      return;
    }

    if (data) {
      // Map the RPC response to our UserMemeProfile type
      const profile: UserMemeProfile = {
        user_id: data.user_id || identifier,
        username: data.username || null,
        role: data.role || null,
        credits: data.credits ?? null,           // From RPC response
        khash: data.khash ?? null,               // From RPC response
        meme_points: data.meme_points ?? null,   // Meme-specific points
        level: data.level ?? null,
        total_memes: data.total_memes ?? null,
        total_likes: data.total_likes ?? null,
        created_at: data.created_at || new Date().toISOString()
      };
      
      // Store in persistent atom so it survives page reloads and sessions
      userMemeProfileAtom.set(profile);
      
      // Also ensure username is synced if we got it from the profile
      if (profile.username && !userNamePersistentAtom.get()) {
        userNamePersistentAtom.set(profile.username);
        usernameAtom.set(profile.username);
        
        // Update localStorage for backward compatibility
        if (typeof window !== 'undefined') {
          localStorage.setItem('memeUsername', profile.username);
        }
      }
      
      console.log('[syncUserMemeProfile] Profile synced from RPC:', profile);
    } else {
      // No profile data returned
      userMemeProfileAtom.set(undefined);
      console.log('[syncUserMemeProfile] No profile data returned for identifier:', identifier);
    }
  } catch (error) {
    console.error('[syncUserMemeProfile] Failed to fetch profile:', error);
    userMemeProfileAtom.set(undefined);
  }
}

// Function to handle user logout and cleanup
export async function logoutUser() {
  try {
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('[logoutUser] Error signing out:', error);
    }
    
    // Clear all user state regardless of signOut result
    clearUserState();
    
    console.log('[logoutUser] User logged out and state cleared');
  } catch (error) {
    console.error('[logoutUser] Unexpected error during logout:', error);
    // Still clear state even if there's an error
    clearUserState();
  }
}

// Function to create/update username via RPC during onboarding
export async function createUserProfile(username: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = userAtom.get();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Call RPC to create/update user profile with username
    const { data, error } = await supabase.rpc('create_user_profile', {
      p_user_id: user.id,
      p_username: username,
      p_email: user.email
    });

    if (error) {
      console.error('[createUserProfile] RPC error:', error);
      return { success: false, error: error.message };
    }

    // Update local state with new username
    usernameAtom.set(username);
    userNamePersistentAtom.set(username);
    
    // Update localStorage for backward compatibility
    if (typeof window !== 'undefined') {
      localStorage.setItem('memeUsername', username);
      localStorage.setItem('onboardingComplete', 'true');
    }

    // Re-sync the profile to get the latest data
    await syncUserMemeProfile(user.id);

    console.log('[createUserProfile] Profile created successfully:', data);
    return { success: true };
  } catch (error) {
    console.error('[createUserProfile] Failed to create profile:', error);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

// Helper: Check if user needs onboarding (no username or no meme profile)
export function needsOnboarding(): boolean {
  const username = usernameAtom.get();
  const profile = userMemeProfileAtom.get();
  
  // User needs onboarding if:
  // 1. No username is set
  // 2. No meme profile exists
  // 3. Profile has no meme_points (indicating incomplete setup)
  return !username || !profile || profile.meme_points === null;
}

// Helper: Check if username is valid (following the same pattern as astro-kbve)
export function validUsername(name: string | null | undefined): boolean {
  if (typeof name !== 'string') return false;
  // Username validation: 3-30 chars, lowercase letters, numbers, underscore, hyphen
  const USERNAME_REGEX = /^[a-z0-9_-]{3,30}$/;
  return USERNAME_REGEX.test(name);
}

// Helper: Check if user is already onboarded
export function isUserOnboarded(): boolean {
  const username = usernameAtom.get();
  const userPersistent = userNamePersistentAtom.get();
  const profile = userMemeProfileAtom.get();
  
  // Check if we have a valid username and a complete profile
  const hasValidUsername = !!(validUsername(username) || validUsername(userPersistent));
  const hasCompleteProfile = !!(profile && profile.meme_points !== null);
  
  return hasValidUsername && hasCompleteProfile;
}

// Helper: Get username from user ID using RPC
export async function getUsernameByUuid(uuid: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('proxy_get_username', { 
      p_user_id: uuid 
    });
    
    if (error) {
      console.error('[getUsernameByUuid] RPC error:', error);
      return null;
    }
    
    return data || null;
  } catch (error) {
    console.error('[getUsernameByUuid] Failed to fetch username:', error);
    return null;
  }
}

// Helper: Get user ID from username using RPC
export async function getUuidByUsername(username: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('proxy_get_uuid', { 
      p_username: username 
    });
    
    if (error) {
      console.error('[getUuidByUsername] RPC error:', error);
      return null;
    }
    
    return data || null;
  } catch (error) {
    console.error('[getUuidByUsername] Failed to fetch user ID:', error);
    return null;
  }
}

// Helper: Get current user profile data (for easy access in React components)
export function getCurrentUserProfile(): UserMemeProfile | undefined {
  return userMemeProfileAtom.get();
}

// Helper: Update user profile data (for when profile changes)
export function updateUserProfile(updates: Partial<UserMemeProfile>) {
  const currentProfile = userMemeProfileAtom.get();
  if (currentProfile) {
    const updatedProfile = { ...currentProfile, ...updates };
    userMemeProfileAtom.set(updatedProfile);
    console.log('[updateUserProfile] Profile updated:', updatedProfile);
  }
}

// Helper: Add meme points to user (for future gamification)
export function addMemePoints(points: number) {
  const currentProfile = userMemeProfileAtom.get();
  if (currentProfile && currentProfile.meme_points !== null) {
    updateUserProfile({ 
      meme_points: currentProfile.meme_points + points 
    });
  }
}

// Helper: Add credits to user (from RPC functions)
export function addCredits(credits: number) {
  const currentProfile = userMemeProfileAtom.get();
  if (currentProfile && currentProfile.credits !== null) {
    updateUserProfile({ 
      credits: currentProfile.credits + credits 
    });
  }
}

// Helper: Add khash to user (from RPC functions)
export function addKhash(khash: number) {
  const currentProfile = userMemeProfileAtom.get();
  if (currentProfile && currentProfile.khash !== null) {
    updateUserProfile({ 
      khash: currentProfile.khash + khash 
    });
  }
}

// Helper: Increment meme count when user creates a meme
export function incrementMemeCount() {
  const currentProfile = userMemeProfileAtom.get();
  if (currentProfile && currentProfile.total_memes !== null) {
    updateUserProfile({ 
      total_memes: currentProfile.total_memes + 1 
    });
  }
}

// Helper: Increment likes when user receives a like
export function incrementLikesCount() {
  const currentProfile = userMemeProfileAtom.get();
  if (currentProfile && currentProfile.total_likes !== null) {
    updateUserProfile({ 
      total_likes: currentProfile.total_likes + 1 
    });
  }
}

// Auth state listener - call this once when your app initializes
export function initializeAuthListener() {
  if (typeof window === 'undefined') return;

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[authStateChange]', event, session?.user?.id);
    
    switch (event) {
      case 'SIGNED_IN':
      case 'TOKEN_REFRESHED':
        await syncSupabaseUser();
        break;
      case 'SIGNED_OUT':
        clearUserState();
        break;
      default:
        // For INITIAL_SESSION, check if we have a user
        if (session?.user) {
          await syncSupabaseUser();
        } else {
          clearUserState();
        }
    }
  });
}
