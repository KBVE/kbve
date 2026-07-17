import {
	findActionInTitleSafe,
	actions,
} from './actions';
import { GithubActionReferenceMap } from './types';

describe('actions.findActionInTitle', () => {
	const referenceMap: GithubActionReferenceMap[] = [
		{ keyword: 'Atlas', action: 'atlas_action' },
		{ keyword: 'Music', action: 'music_action' },
	];

	it('should return the correct action for a keyword found in the title', () => {
		const title = 'This is a title about Atlas and its features';
		const result = actions.findActionInTitle(title, referenceMap);
		expect(result).toEqual('atlas_action');
	});

	it('should return the correct action for another keyword found in the title', () => {
		const title = 'A great collection of Music';
		const result = actions.findActionInTitle(title, referenceMap);
		expect(result).toEqual('music_action');
	});

	it('should throw an error if no keywords are found in the title', () => {
		const title = 'No relevant keyword';
		expect(() => actions.findActionInTitle(title, referenceMap)).toThrow(
			'No matching keyword found in title',
		);
	});

	it('should throw an error if the reference map is empty', () => {
		const title = 'This is a title about Atlas and its features';
		const emptyReferenceMap: GithubActionReferenceMap[] = [];
		expect(() => actions.findActionInTitle(title, emptyReferenceMap)).toThrow(
			'No matching keyword found in title',
		);
	});
});

describe('actions.kbveActionProcess', () => {
	it('should return the correct action for a keyword found in the title using the default reference map', () => {
		const title = 'This is a title about Atlas and its features';
		const result = actions.kbveActionProcess(title);
		expect(result).toEqual('atlas_action');
	});

	it('should return the correct action for another keyword found in the title using the default reference map', () => {
		const title = 'A great collection of Music';
		const result = actions.kbveActionProcess(title);
		expect(result).toEqual('music_action');
	});

	it('should throw an error if no keywords are found in the title using the default reference map', () => {
		const title = 'No relevant keyword';
		expect(() => actions.kbveActionProcess(title)).toThrow(
			'No matching keyword found in title',
		);
	});
});

describe('findActionInTitleSafe (v0.0.21)', () => {
	const map = [{ keyword: 'atlas', action: 'atlas_action' }];
	it('returns the action when matched', () => {
		expect(findActionInTitleSafe('run atlas now', map)).toBe(
			'atlas_action',
		);
	});
	it('returns null on no match instead of throwing', () => {
		expect(findActionInTitleSafe('nothing here', map)).toBeNull();
	});
});

describe('gha.actions group (v0.0.22)', () => {
	it('includes findActionInTitleSafe', () => {
		expect(typeof actions.findActionInTitleSafe).toBe('function');
	});
});
