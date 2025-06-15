import { atom } from 'nanostores';
import type { User } from '@supabase/supabase-js';

// Holds the current user (null if not logged in)
export const userAtom = atom<User | null>(null);

// Optionally, you can add more atoms for loading and error states
export const userLoadingAtom = atom<boolean>(true);
export const userErrorAtom = atom<string>("");
