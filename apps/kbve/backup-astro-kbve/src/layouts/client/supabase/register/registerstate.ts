import { atom } from 'nanostores';

export const emailAtom = atom<string>("");
export const passwordAtom = atom<string>("");
export const confirmPasswordAtom = atom<string>("");
export const agreedAtom = atom<boolean>(false);
export const captchaTokenAtom = atom<string | null>(null);
export const errorAtom = atom<string>("");
export const successAtom = atom<string>("");
export const loadingAtom = atom<boolean>(false);
export const displayNameAtom = atom<string>("");
