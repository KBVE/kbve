import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { User } from '@supabase/supabase-js';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

// Holds the current user (null if not logged in)
export const userAtom = atom<User | null>(null);

// Atom for the username (null if not set)
export const usernameAtom = atom<string | null>(null);

// Persistent atoms for user id, email, and username
export const userIdAtom = persistentAtom<string | undefined>('user:id', undefined);
export const userEmailAtom = persistentAtom<string | undefined>('user:email', undefined);
export const userNamePersistentAtom = persistentAtom<string | undefined>('user:username', undefined);

// Optionally, you can add more atoms for loading and error states
export const userLoadingAtom = atom<boolean>(true);
export const userErrorAtom = atom<string>("");

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

// Persistent atom for user balance view
function serializeUserBalance(value: UserBalanceView | undefined): string {
  return value ? JSON.stringify(value) : "";
}

function deserializeUserBalance(value: string | undefined): UserBalanceView | undefined {
  return value ? JSON.parse(value) as UserBalanceView : undefined;
}

export const userBalanceAtom = persistentAtom<UserBalanceView | undefined>(
  'user:balance',
  undefined,
  {
    encode: serializeUserBalance,
    decode: deserializeUserBalance,
  }
);

// Utility function to sync userAtom and persistent atoms with supabase session
export async function syncSupabaseUser() {
  const { data } = await supabase.auth.getUser();
  if (typeof window !== 'undefined') {
    // Default isMember to false if not set
    if (localStorage.getItem('isMember') === null) {
      localStorage.setItem('isMember', 'false');
    }
  }
  if (data?.user) {
    userAtom.set(data.user);
    userIdAtom.set(data.user.id ?? undefined);
    userEmailAtom.set(data.user.email ?? undefined);
    // Username may be in user.user_metadata or a custom field
    const username = data.user.user_metadata?.username ?? undefined;
    usernameAtom.set(username ?? null);
    userNamePersistentAtom.set(username);
    if (typeof window !== 'undefined') {
      localStorage.setItem('isMember', 'true');
    }
  } else {
    userAtom.set(null);
    userIdAtom.set(undefined);
    userEmailAtom.set(undefined);
    usernameAtom.set(null);
    userNamePersistentAtom.set(undefined);
    if (typeof window !== 'undefined') {
      localStorage.setItem('isMember', 'false');
    }
  }
}

// Function to fetch and sync user balance from Supabase
export async function syncUserBalance(identifier: string, useCache = true) {
  if (!identifier) {
    userBalanceAtom.set(undefined);
    return;
  }

  const { data, error } = await supabase.rpc('get_user_balance_context', {
    p_identifier: identifier,
    use_cache: useCache,
  });

  if (data && data.length > 0 && !error) {
    userBalanceAtom.set(data[0] as UserBalanceView);
  } else {
    console.error('[syncUserBalance] Failed to fetch balance:', error?.message);
    userBalanceAtom.set(undefined);
  }
}

// TODO: Move into indexdb, so that we can cache the results.
// Helper: Get username from user ID using Supabase RPC
export async function getUsernameByUuid(uuid: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('proxy_get_username', { p_user_id: uuid });
  if (error) {
    console.error('[getUsernameByUuid] Failed to fetch username:', error.message);
    return null;
  }
  return data;
}

// TODO: Move to indexdb , so that we can cache the results.
// Helper: Get user ID from username using Supabase RPC
export async function getUuidByUsername(username: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('proxy_get_uuid', { p_username: username });
  if (error) {
    console.error('[getUuidByUsername] Failed to fetch UUID:', error.message);
    return null;
  }
  return data;
}