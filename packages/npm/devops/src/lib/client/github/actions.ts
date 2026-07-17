import { _title } from '../../sanitization';
import { GithubActionReferenceMap } from './types';

function findActionInTitle(
	title: string,
	referenceMap: GithubActionReferenceMap[],
): string {
	const sanitizedTitle = _title(title);

	for (const item of referenceMap) {
		if (sanitizedTitle.includes(item.keyword)) {
			return item.action;
		}
	}
	throw new Error('No matching keyword found in title');
}

const defaultReferenceMap: GithubActionReferenceMap[] = [
	{ keyword: 'atlas', action: 'atlas_action' },
	{ keyword: 'music', action: 'music_action' },
];

function kbveActionProcess(title: string): string {
	return findActionInTitle(title.toLowerCase(), defaultReferenceMap);
}

export function findActionInTitleSafe(
	title: string,
	referenceMap: GithubActionReferenceMap[],
): string | null {
	const sanitizedTitle = _title(title);
	for (const item of referenceMap) {
		if (sanitizedTitle.includes(item.keyword)) {
			return item.action;
		}
	}
	return null;
}

export const actions = {
	findActionInTitle,
	kbveActionProcess,
	findActionInTitleSafe,
};
