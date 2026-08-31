import { fetchJoke } from '../shared/joke.ts';

export async function main(source = '') {
	const joke = await fetchJoke(source);
	return { text: joke.text, source: joke.source };
}
