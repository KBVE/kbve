import { _title } from '../../sanitization';
import { GithubActionReferenceMap } from './types';

export function _$gha_findActionInTitle(
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

export function _$gha_kbve_ActionProcess(title: string): string {
  return _$gha_findActionInTitle(title.toLowerCase(), defaultReferenceMap);
}
