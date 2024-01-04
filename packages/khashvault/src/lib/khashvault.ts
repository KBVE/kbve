// 	? [Types]

// Declaring a TypeScript type 'kbveLocker' for user profile information.
export type kbveLocker = {
	/* core */
	username: string; // User's username.
	uuid: string; // User's unique identifier (UUID).
	email: string; // User's email address.

	/* profile */
	avatar: string; // URL to the user's avatar image.
	github: string; // User's GitHub profile URL.
	instagram: string; // User's Instagram profile URL.
	bio: string; // Short biography or description of the user.
	pgp: string; // PGP key or identifier for the user.
	unsplash: string; // User's Unsplash profile URL.
};

//	? [IMPORTS]

import { atom, WritableAtom, task, keepMount } from 'nanostores'; // Importing from 'nanostores' for state management.
import { persistentMap } from '@nanostores/persistent'; // Importing 'persistentMap' for persistent state management.

// Exporting a constant 'kbve_v01d' representing a version or an identifier.
export const kbve_v01d: string = '/api/v1/';

//? [DATA]->@core
// Defining core data atoms for application state management.
export const khash$: WritableAtom<number> = atom(0); // Atom for keeping a hash value, initialized to 0.
export const uuid$: WritableAtom<string> = atom(undefined); // Atom for keeping a UUID, initially undefined.

//? [DATA]->[UI]
// Defining UI-related data atoms.
export const avatar$: WritableAtom<string> = atom(
	'https://source.unsplash.com/192x192/?portrait' // Atom for storing avatar URL, with a default portrait image.
);

//? [DATA]->[UX]
// Defining User Experience (UX) related data atoms.
export const error$: WritableAtom<string> = atom(''); // Atom for storing error messages.
export const notification$: WritableAtom<string> = atom(''); // Atom for storing notification messages.
export const fetchProfile$: WritableAtom<string> = atom(''); // Atom for actions related to fetching profiles.
export const toast$: WritableAtom<string> = atom(''); // Atom for storing toast messages.

//? [DATA]=>[DX]
// Defining Developer Experience (DX) related data atoms.
export const log$: WritableAtom<string> = atom(''); // Atom for storing log messages.

//? [CACHE]
// Defining persistent data cache.
export const kbve$ = persistentMap<kbveLocker>('kbve:'); // Persistent map for storing 'kbveLocker' data, with a namespace.

// Function to log messages.
export const log = async (log: string) => {
	task(async () => {
		log$.set(log); // Setting the log message in the log atom.
		console.log(`[LOG] ${log$.get()}`); // Logging the message.
	});
};

// Function to handle notifications.
export const notification = async (error: string) => {
	task(async () => {
		notification$.set(error); // Setting the notification message.
		toast$.set(error); // Also setting the message in toast atom.
	});
};

// General-purpose task function for updating atom states.
export const tasker = async (__key: WritableAtom, __data: string) => {
	task(async () => {
		log(`Storing ${__data} into atom!`); // Logging the operation.
		__key.set(__data); // Updating the atom with new data.
		keepMount(__key); // Keeping the atom mounted.
	});
};

// Function to update the locker (persistent data).
export const locker = async (__key: keyof kbveLocker, __data: string) => {
	task(async () => {
		log(`Storing ${__data} into locker for ${__key}`); // Logging the operation.
		kbve$.setKey(__key, __data); // Updating the locker with new data.
	});
};

// ? vitest

export function khashvaulttest(): string {
	return 'khashvaulttest';
}
