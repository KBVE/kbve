import { _title } from '../sanitization';

export interface GithubActionReferenceMap {
  keyword: string;
  action: string;
}

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
  { keyword: 'Atlas', action: 'atlas_action' },
  { keyword: 'Music', action: 'music_action' },
  // Add more default mappings as needed
];

export function _$gha_kbve_ActionProcess(title: string): string {
  return _$gha_findActionInTitle(title, defaultReferenceMap);
}
