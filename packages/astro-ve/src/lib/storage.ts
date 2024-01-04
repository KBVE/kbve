// Importing required modules and functions.
import { atom, WritableAtom, task, keepMount } from 'nanostores'; // Importing from 'nanostores' for state management.
import { persistentMap } from '@nanostores/persistent'; // Importing 'persistentMap' for persistent state management.
import * as kbve from './kbve'; // Importing from the 'kbve' module.
// import Toastify from 'toastify-js'

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
export const kbve$ = persistentMap<kbve.kbveLocker>('kbve:'); // Persistent map for storing 'kbveLocker' data, with a namespace.

//* [FUNCTIONS]
// Defining various functions for application state and side effects.

// Subscribing to toast atom changes and logging them.
toast$.subscribe((toast) => {
	console.log(`[TOAST] -> ${toast}`); // Logging toast messages.
	// if (typeof Toastify === 'function' && toast && typeof window !== 'undefined' && typeof document !== 'undefined') {

	// Toastify({
	//     gravity: "bottom", // `top` or `bottom`
	//     position: "right", // `left`, `center` or `right`
	//     text: toast,

	//     duration: 5000,
	//     stopOnFocus: true,
	//     style: {
	//         background: "linear-gradient(to right, #00b09b, #96c93d)",
	//       },
	//     }).showToast();
	// }
});

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
export const tasker = async (__key: WritableAtom, __data: any) => {
	task(async () => {
		log(`Storing ${__data} into atom!`); // Logging the operation.
		__key.set(__data); // Updating the atom with new data.
		keepMount(__key); // Keeping the atom mounted.
	});
};

// Function to update the locker (persistent data).
export const locker = async (__key: keyof kbve.kbveLocker, __data: string) => {
	task(async () => {
		log(`Storing ${__data} into locker for ${__key}`); // Logging the operation.
		kbve$.setKey(__key, __data); // Updating the locker with new data.
	});
};

// Function to handle '_ve' operations, such as sending data to a server.
export const _ve = async (__data: string) => {
	task(async () => {
		const response = await fetch(kbve.kbve_v01d, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(__data),
		});

		const result = await response.json(); // Parsing the response to JSON.
		log(result); // Logging the result.
	});
};
