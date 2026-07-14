import { atom } from 'nanostores';
import { resetCore } from '../lib/chat/store';

export * from '../lib/chat/store';

// Embed-only auth/session atoms. The main-app chat tree keeps its avatar in
// components/chat/auth.ts; the embed surfaces it directly off the store.
export const $canSend = atom<boolean>(false);
export const $avatarUrl = atom<string>('');

export function resetState(): void {
	resetCore();
	$canSend.set(false);
	$avatarUrl.set('');
}
