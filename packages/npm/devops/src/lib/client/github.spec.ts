import { _$gha_findActionInTitle, _$gha_kbve_ActionProcess, GithubActionReferenceMap } from './github';


describe('_$gha_findActionInTitle', () => {
    const referenceMap: GithubActionReferenceMap[] = [
      { keyword: 'Atlas', action: 'atlas_action' },
      { keyword: 'Music', action: 'music_action' }
    ];
  
    it('should return the correct action for a keyword found in the title', () => {
      const title = 'This is a title about Atlas and its features';
      const result = _$gha_findActionInTitle(title, referenceMap);
      expect(result).toEqual('atlas_action');
    });
  
    it('should return the correct action for another keyword found in the title', () => {
      const title = 'A great collection of Music';
      const result = _$gha_findActionInTitle(title, referenceMap);
      expect(result).toEqual('music_action');
    });
  
    it('should throw an error if no keywords are found in the title', () => {
      const title = 'No relevant keyword';
      expect(() => _$gha_findActionInTitle(title, referenceMap)).toThrow('No matching keyword found in title');
    });
  
    it('should throw an error if the reference map is empty', () => {
      const title = 'This is a title about Atlas and its features';
      const emptyReferenceMap: GithubActionReferenceMap[] = [];
      expect(() => _$gha_findActionInTitle(title, emptyReferenceMap)).toThrow('No matching keyword found in title');
    });
  });
  
  describe('_$gha_kbve_ActionProcess', () => {
    it('should return the correct action for a keyword found in the title using the default reference map', () => {
      const title = 'This is a title about Atlas and its features';
      const result = _$gha_kbve_ActionProcess(title);
      expect(result).toEqual('atlas_action');
    });
  
    it('should return the correct action for another keyword found in the title using the default reference map', () => {
      const title = 'A great collection of Music';
      const result = _$gha_kbve_ActionProcess(title);
      expect(result).toEqual('music_action');
    });
  
    it('should throw an error if no keywords are found in the title using the default reference map', () => {
      const title = 'No relevant keyword';
      expect(() => _$gha_kbve_ActionProcess(title)).toThrow('No matching keyword found in title');
    });
  });