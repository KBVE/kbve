import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { User } from '@supabase/supabase-js';

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
  meme_points: number | null;    // Instead of credits, we have meme points
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
  // For now, this will be a placeholder until we set up Supabase integration
  // In the real implementation, this would call:
  // const { data } = await supabase.auth.getUser();
  
  // Placeholder for development - check localStorage for demo purposes
  if (typeof window !== 'undefined') {
    const storedUsername = localStorage.getItem('memeUsername');
    const storedUserId = localStorage.getItem('memeUserId');
    const storedEmail = localStorage.getItem('memeUserEmail');
    
    if (storedUsername) {
      // Simulate a user session for development
      const mockUser: Partial<User> & { id: string; email: string } = {
        id: storedUserId || 'demo-user-id',
        email: storedEmail || 'demo@meme.sh',
        user_metadata: {
          username: storedUsername
        },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        app_metadata: {},
        email_confirmed_at: new Date().toISOString(),
        phone_confirmed_at: undefined,
        confirmation_sent_at: undefined,
        recovery_sent_at: undefined,
        email_change_sent_at: undefined,
        new_email: undefined,
        invited_at: undefined,
        action_link: undefined,
        phone: undefined,
        role: 'authenticated',
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        identities: []
      };
      
      userAtom.set(mockUser as User);
      userIdAtom.set(mockUser.id);
      userEmailAtom.set(mockUser.email);
      usernameAtom.set(storedUsername);
      userNamePersistentAtom.set(storedUsername);
      
      // Set up a mock meme profile
      const mockProfile: UserMemeProfile = {
        user_id: mockUser.id,
        username: storedUsername,
        role: 'member',
        meme_points: 100,
        level: 1,
        total_memes: 0,
        total_likes: 0,
        created_at: new Date().toISOString()
      };
      
      userMemeProfileAtom.set(mockProfile);
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('isMember', 'true');
      }
    } else {
      // Clear user state
      userAtom.set(null);
      userIdAtom.set(undefined);
      userEmailAtom.set(undefined);
      usernameAtom.set(null);
      userNamePersistentAtom.set(undefined);
      userMemeProfileAtom.set(undefined);
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('isMember', 'false');
      }
    }
  }
}

// Function to fetch and sync user meme profile (equivalent to syncUserBalance in astro-kbve)
export async function syncUserMemeProfile(identifier: string, useCache = true) {
  if (!identifier) {
    userMemeProfileAtom.set(undefined);
    return;
  }

  // For now, this is a placeholder until we set up backend integration
  // In the real implementation, this would call:
  // const { data, error } = await supabase.rpc('get_user_meme_profile', {
  //   p_identifier: identifier,
  //   use_cache: useCache,
  // });

  // Simulate a successful profile fetch for development
  try {
    const mockProfile: UserMemeProfile = {
      user_id: identifier,
      username: userNamePersistentAtom.get() || null,
      role: 'member',
      meme_points: Math.floor(Math.random() * 1000) + 100,
      level: Math.floor(Math.random() * 10) + 1,
      total_memes: Math.floor(Math.random() * 50),
      total_likes: Math.floor(Math.random() * 500),
      created_at: new Date().toISOString()
    };
    
    userMemeProfileAtom.set(mockProfile);
  } catch (error) {
    console.error('[syncUserMemeProfile] Failed to fetch profile:', error);
    userMemeProfileAtom.set(undefined);
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

// Helper: Get username from user ID (placeholder for future backend integration)
export async function getUsernameByUuid(uuid: string): Promise<string | null> {
  // TODO: Replace with actual backend call
  // const { data, error } = await supabase.rpc('proxy_get_username', { p_user_id: uuid });
  
  // For development, return a mock username
  return `user_${uuid.slice(0, 8)}`;
}

// Helper: Get user ID from username (placeholder for future backend integration)
export async function getUuidByUsername(username: string): Promise<string | null> {
  // TODO: Replace with actual backend call
  // const { data, error } = await supabase.rpc('proxy_get_uuid', { p_username: username });
  
  // For development, return a mock UUID
  return `uuid-for-${username}`;
}
