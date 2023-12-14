import { atom, WritableAtom, task, keepMount } from "nanostores";
import { persistentMap } from "@nanostores/persistent";
import * as kbve from "./core";


//?			[DATA]->@core
export const khash$: WritableAtom<number> = atom(0);
export const uuid$: WritableAtom<string> = atom(undefined);

//?         [DATA]->[UI]
export const avatar$: WritableAtom<string> = atom(
	"https://source.unsplash.com/192x192/?portrait",
);

//?         [DATA]->[UX]
export const error$: WritableAtom<string> = atom("");
export const notification$: WritableAtom<string> = atom("");
export const fetchProfile$: WritableAtom<string> = atom("");
export const toast$: WritableAtom<string> = atom("");

//?         [DATA]=>[DX]
export const log$: WritableAtom<string> = atom("");

//?         [CACHE]
export const kbve$ = persistentMap<kbve.kbveLocker>("kbve:");

//*         [FUNCTIONS]

toast$.subscribe( toast => {
	console.log(`[TOAST] -> ${toast}`)
})

export const log = async (log: string) => {
	task(async () => {
		log$.set(log);
		console.log(`[LOG] ${log$.get()}`);
	});
};

export const notification = async (error: string) => {
	task(async () => {
		notification$.set(error);
		toast$.set(error);
	});
};

export const tasker = async (__key: WritableAtom, __data: any) => {
	task(async () => {
		log(`Storing ${__data} into atom!`);
		__key.set(__data);
		keepMount(__key);
	});
};

export const locker = async (__key: keyof kbve.kbveLocker, __data: string) => {
	task(async () => {
		log(`Storing ${__data} into locker for ${__key}`);
		kbve$.setKey(__key, __data);
	});
};


export const _ve = async (__data: string) => {
	task(async () => {
		const response = await fetch(kbve.kbve_v01d, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(__data),
		});

		const result = await response.json();
		log(result);
	});
};