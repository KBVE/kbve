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

export interface Layout {
	i: string; // Unique identifier for the item
	x: number; // x coordinate on the grid
	y: number; // y coordinate on the grid
	w: number; // width of the item
	h: number; // height of the item
	moved?: boolean;
	static?: boolean;
}

export interface AtlasItem {

	error: string;
	message: string;
	state: 'active' | 'update' | 'disable' | 'process';


}

export interface AtlasData {
	plugin: AtlasItem[];
}

export interface MusicItem {
	id: string;
	name: string;
	description: string;
	tags: string[];
	ytTracks: string[]; // YouTube track IDs as strings
	ytSets: string[]; // YouTube set IDs as strings
}

export interface MusicData {
	items: MusicItem[];
}

//	? [IMPORTS]

import { atom, WritableAtom, task, keepMount } from 'nanostores'; // Importing from 'nanostores' for state management.
import { persistentMap, persistentAtom } from '@nanostores/persistent'; // Importing 'persistentMap' for persistent state management.

// Atlas Default

export const atlas$ = persistentAtom<AtlasData>(
	'atlas',
	{ plugin: [] },
	{
		encode: JSON.stringify,
		decode: JSON.parse,
	},
);

// Define the function for adding or updating a plugin
export async function addOrUpdatePlugin(pluginId: number, error: string, message: string, state: 'active' | 'update' | 'disable' | 'process') {
	const currentState = atlas$.get();
	const newPlugin = { error, message, state };
	const updatedPlugins = currentState.plugin ? [...currentState.plugin] : [];
	updatedPlugins[pluginId] = newPlugin;
	atlas$.set({ ...currentState, plugin: updatedPlugins });
}

// Define the function to get a plugin
export async function getPlugin(pluginId: number): Promise<AtlasItem | undefined> {
	const currentState = atlas$.get();
	return currentState.plugin ? currentState.plugin[pluginId] : undefined;
}

// Define the function to update a plugin's state
export async function updatePluginState(pluginId: number, state: 'active' | 'update' | 'disable' | 'process') {
	const currentState = atlas$.get();
	const updatedPlugins = currentState.plugin ? [...currentState.plugin] : [];
	if (updatedPlugins[pluginId]) {
		updatedPlugins[pluginId].state = state;
	}
	atlas$.set({ ...currentState, plugin: updatedPlugins });
}

// Define the function to update a plugin's error
export async function updatePluginError(pluginId: number, error: string) {
	const currentState = atlas$.get();
	const updatedPlugins = currentState.plugin ? [...currentState.plugin] : [];
	if (updatedPlugins[pluginId]) {
		updatedPlugins[pluginId].error = error;
	}
	atlas$.set({ ...currentState, plugin: updatedPlugins });
}

// Define the function to update a plugin's message
export async function updatePluginMessage(pluginId: number, message: string) {
	const currentState = atlas$.get();
	const updatedPlugins = currentState.plugin ? [...currentState.plugin] : [];
	if (updatedPlugins[pluginId]) {
		updatedPlugins[pluginId].message = message;
	}
	atlas$.set({ ...currentState, plugin: updatedPlugins });
}


// JukeBox Default
export const musicData$ = persistentAtom<MusicData>(
	'musicData',
	{ items: [] },
	{
		encode: JSON.stringify,
		decode: JSON.parse,
	},
);

// export type Tags = {
// 	key: string; 
// 	active: string;
// } 
// export const tagSetting$ = persistentMap<Tags>('tagSettings:');

export interface Tags {
    [tagName: string]: boolean;
}

// Initialize the persistentAtom with an empty object for tags.
export const tagSetting$ = persistentAtom<Tags>('tagSettings', {}, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export const updateJukeBox$$$ = task(async () => {
	const response = await fetch('/api/music.json');
	if (!response.ok) {
		throw new Error('Failed to fetch music data');
	}
	const data: MusicData = await response.json();
	musicData$.set(data);
	return data;
});

// Layout Default
const defaultLayout: Layout[] = [
	{ i: 'a', x: 0, y: 0, w: 4, h: 16, moved: false, static: true },
	{ i: 'b', x: 4, y: 0, w: 4, h: 4, moved: false, static: false },
	{ i: 'c', x: 4, y: 4, w: 4, h: 4, moved: false, static: false },
	{ i: 'd', x: 4, y: 16, w: 4, h: 4, moved: false, static: false },
	{ i: 'e', x: 4, y: 8, w: 4, h: 4, moved: false, static: false },
	{ i: 'f', x: 8, y: 16, w: 4, h: 4, moved: false, static: false },
	{ i: 'g', x: 4, y: 12, w: 4, h: 4, moved: false, static: false },
	{ i: 'h', x: 8, y: 12, w: 4, h: 4, moved: false, static: false },
	{ i: 'i', x: 0, y: 16, w: 4, h: 4, moved: false, static: false },
	{ i: 'j', x: 8, y: 0, w: 4, h: 12, moved: false, static: false },
];

export const layoutStore$ = persistentAtom<Layout[]>(
	'layoutKey',
	defaultLayout,
	{
		encode: JSON.stringify,
		decode: JSON.parse,
	},
);

export function updateLayout(newLayout: Layout[]) {
	layoutStore$.set(newLayout);
}

// Exporting a constant 'kbve_v01d' representing a version or an identifier.
export const kbve_v01d = '/api/v1/';

//? [DATA]->@core
// Defining core data atoms for application state management.
export const khash$: WritableAtom<number> = atom(0); // Atom for keeping a hash value, initialized to 0.
export const uuid$: WritableAtom<string> = atom(undefined); // Atom for keeping a UUID, initially undefined.

//? [DATA]->[UI]
// Defining UI-related data atoms.
export const avatar$: WritableAtom<string> = atom(
	'https://source.unsplash.com/192x192/?portrait', // Atom for storing avatar URL, with a default portrait image.
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
