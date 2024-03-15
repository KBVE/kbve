import { persistentAtom } from '@nanostores/persistent';
import { type WritableStore } from 'nanostores';
import { atom, map } from 'nanostores'


export type StoredType = string[];
export type LoadingStateValue = 'empty' | 'loading' | 'loaded' | 'ready'


export const $registerAction: WritableStore<string[]> = persistentAtom<string[]>('registerAction', [], {
    encode(value) {
      return JSON.stringify(value);
    },
    decode(value) {
      try {
        // Ensure that the parsed value matches the expected StoredType
        const parsed: StoredType = JSON.parse(value);
        return parsed;
      } catch {
        // Return a default value that matches the StoredType
        return [] as StoredType;
      }
    },
  });


export const $registerAtom = atom<LoadingStateValue>('empty');

export interface RegisterFormType {
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
    token: string,
}

export const $registerMap = map<RegisterFormType>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    token: 'token'
  })