import { _isULID, markdownToJsonSafeString, markdownToJsonSafeStringThenStrip, _md2json, __md2json, _title} from './sanitization';

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

describe('markdownToJsonSafeString', () => {
  it('should convert markdown to JSON-safe string', async () => {
    const markdown = '# Hello, World!';
    const result = await markdownToJsonSafeString(markdown);
    expect(result).toEqual(JSON.stringify('Hello, World!'));
  });
});

describe('markdownToJsonSafeStringThenStrip', () => {
  it('should convert markdown to JSON-safe string and strip non-alphanumeric characters', async () => {
    const markdown = '# Hello, World! @2021';
    const result = await markdownToJsonSafeStringThenStrip(markdown);
    expect(result).toEqual('Hello World 2021');
  });
});

describe('_md2json', () => {
  it('should convert markdown to JSON-safe string using _md2json', async () => {
    const markdown = '# Hello, World!';
    const result = await _md2json(markdown);
    expect(result).toEqual(JSON.stringify('Hello, World!'));
  });
});

describe('__md2json', () => {
  it('should convert markdown to JSON-safe string and strip non-alphanumeric characters using __md2json', async () => {
    const markdown = '# Hello, World! @2021';
    const result = await __md2json(markdown);
    expect(result).toEqual('Hello World 2021');
  });
});

describe('_title', () => {
  it('should clean the title by keeping only allowed characters', () => {
    const title = 'This is a [test] title with 123 numbers, and special characters! @#$%^&*()';
    const result = _title(title);
    expect(result).toEqual('This is a [test] title with 123 numbers and special characters');
  });

  it('should truncate and clean the title if longer than 64 characters', () => {
    const title = 'This is a very long title that exceeds sixty-four characters in length! @#$%^&*()';
    const result = _title(title);
    expect(result).toEqual('This is a very long title that exceeds sixty-four characters in');
  });

  it('should handle empty string input gracefully', () => {
    const title = '';
    const result = _title(title);
    expect(result).toEqual('');
  });

  it('should handle input with only special characters', () => {
    const title = '@#$%^&*()';
    const result = _title(title);
    expect(result).toEqual('');
  });

  it('should handle input with only allowed characters', () => {
    const title = 'Allowed characters 123. - []';
    const result = _title(title);
    expect(result).toEqual('Allowed characters 123. - []');
  });

  it('should remove accented and special characters', () => {
    const title = 'This title has accented characters: Æ, Ä, Â, Ɑ, Ʌ, Ɐ, ª!';
    const result = _title(title);
    expect(result).toEqual('This title has accented characters');
  });

});