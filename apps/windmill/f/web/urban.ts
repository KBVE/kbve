import { fetchDefinition } from '../shared/urban.ts';

export async function main(term = '') {
	return await fetchDefinition(term);
}
