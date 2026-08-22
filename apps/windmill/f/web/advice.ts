import { fetchAdvice } from '../shared/advice.ts';

export async function main(query = '') {
	const advice = await fetchAdvice(query);
	return { text: advice.text, id: advice.id };
}
