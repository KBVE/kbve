import { _isULID } from './sanitization';

describe('ulid', () => {
  it('should return false for non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(_isULID(12345 as any)).toEqual(false);
  });

  it('should return false for invalid ULID format', () => {
    expect(_isULID('invalidULIDstring12345678901234')).toEqual(false);
  });


  it('should return true for valid ULID', () => {
    expect(_isULID('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toEqual(true);
  });

});
