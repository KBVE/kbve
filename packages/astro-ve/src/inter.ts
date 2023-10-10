export interface Props {
	//* Load
	load:
		| 'none'
		| 'lazy'
		| 'partytown'
		| 'helmet'
		| 'true'
		| 'react'
		| 'svelte';
	//* VE
	ve?: string;
	//* Data
	data?: string;
	//* Widget
	widget?: string;
	//* Wrapper
	wrapper?: boolean;
	//* Image
	img?: string;
	//*	Emoji
	e?: string;
}