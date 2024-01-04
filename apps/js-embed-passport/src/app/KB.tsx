import { atom } from 'nanostores';
import { persistentMap } from '@nanostores/persistent';

export const x$ = atom(0);

export const kbve$ = persistentMap('kbve:', [], {
	encode(value) {
		return JSON.stringify(value);
	},
	decode(value) {
		try {
			return JSON.parse(value);
		} catch (error) {
			return value;
		}
	},
});
