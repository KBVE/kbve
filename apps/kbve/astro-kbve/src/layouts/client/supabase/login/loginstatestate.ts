import { atom } from 'nanostores';

export const emailAtom = atom<string>("");
export const passwordAtom = atom<string>("");
export const errorAtom = atom<string>("");
export const successAtom = atom<string>("");
export const loadingAtom = atom<boolean>(false);
export const captchaTokenAtom = atom<string | null>(null);
