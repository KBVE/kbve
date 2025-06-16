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

// Utility function to sync userAtom and persistent atoms with supabase session
export async function syncSupabaseUser() {
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    userAtom.set(data.user);
    userIdAtom.set(data.user.id ?? undefined);
    userEmailAtom.set(data.user.email ?? undefined);
    // Username may be in user.user_metadata or a custom field
    const username = data.user.user_metadata?.username ?? undefined;
    usernameAtom.set(username ?? null);
    userNamePersistentAtom.set(username);
  } else {
    userAtom.set(null);
    userIdAtom.set(undefined);
    userEmailAtom.set(undefined);
    usernameAtom.set(null);
    userNamePersistentAtom.set(undefined);
  }
}
