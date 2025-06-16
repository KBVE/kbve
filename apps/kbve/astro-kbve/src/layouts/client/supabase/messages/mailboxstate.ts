import { atom } from 'nanostores';

// Holds the cached list of messages
export const mailboxMessagesAtom = atom<any[]>([]);
export const mailboxLoadingAtom = atom<boolean>(false);
export const mailboxErrorAtom = atom<string | null>(null);

// Optionally, store the last fetch timestamp for cache invalidation
export const mailboxLastFetchAtom = atom<number | null>(null);

// Helper to fetch and cache messages
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

export async function fetchAndCacheMailbox() {
  mailboxLoadingAtom.set(true);
  mailboxErrorAtom.set(null);
  try {
    const { data, error } = await supabase.rpc('proxy_fetch_user_messages');
    if (error) {
      mailboxErrorAtom.set(error.message || 'Failed to fetch messages');
      mailboxMessagesAtom.set([]);
    } else {
      mailboxMessagesAtom.set(data || []);
      mailboxLastFetchAtom.set(Date.now());
    }
  } catch (e: any) {
    mailboxErrorAtom.set(e.message || 'Unknown error');
    mailboxMessagesAtom.set([]);
  } finally {
    mailboxLoadingAtom.set(false);
  }
}
