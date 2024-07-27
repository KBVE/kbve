import {
  _isULID,
  markdownToJsonSafeString,
  markdownToJsonSafeStringThenStrip,
  _md2json,
  __md2json,
  _title,
  _md_safe_row,
  sanitizePort,
  sanitizeContainerName,
  sanitizeContainerImage,
} from './sanitization';

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
    const title =
      'This is a [test] title with 123 numbers, and special characters! @#$%^&*()';
    const result = _title(title);
    expect(result).toEqual(
      'This is a [test] title with 123 numbers and special characters',
    );
  });

  it('should truncate and clean the title if longer than 64 characters', () => {
    const title =
      'This is a very long title that exceeds sixty-four characters in length! @#$%^&*()';
    const result = _title(title);
    expect(result).toEqual(
      'This is a very long title that exceeds sixty-four characters in',
    );
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

describe('_md_safe_row', () => {
  it('should escape pipe characters', async () => {
    const row = 'Column 1 | Column 2';
    const result = await _md_safe_row(row);
    expect(result).toEqual('Column 1 \\| Column 2');
  });

  it('should escape underscore characters', async () => {
    const row = 'This is a test_row';
    const result = await _md_safe_row(row);
    expect(result).toEqual('This is a test\\_row');
  });

  it('should escape asterisk characters', async () => {
    const row = 'This is *bold* text';
    const result = await _md_safe_row(row);
    expect(result).toEqual('This is \\*bold\\* text');
  });

  it('should escape backslash characters', async () => {
    const row = 'This is a backslash: \\';
    const result = await _md_safe_row(row);
    expect(result).toEqual('This is a backslash: \\\\');
  });

  it('should escape square bracket characters', async () => {
    const row = 'This is a [link]';
    const result = await _md_safe_row(row);
    expect(result).toEqual('This is a \\[link\\]');
  });

  it('should escape parenthesis characters', async () => {
    const row = 'Porter Robinson - Sad Machine (Official Lyric Video)';
    const result = await _md_safe_row(row);
    expect(result).toEqual(
      'Porter Robinson - Sad Machine \\(Official Lyric Video\\)',
    );
  });

  it('should handle multiple special characters', async () => {
    const row = 'This is *bold* text with [link](url) and | pipe';
    const result = await _md_safe_row(row);
    expect(result).toEqual(
      'This is \\*bold\\* text with \\[link\\]\\(url\\) and \\| pipe',
    );
  });
});

describe('sanitizePort', () => {
  it('should return a valid port number', () => {
    const port = '8080';
    const result = sanitizePort(port);
    expect(result).toEqual(8080);
  });

  it('should throw an error for a non-numeric port', () => {
    const port = 'abc';
    expect(() => sanitizePort(port)).toThrow(
      'Invalid port number. Port must be a number between 1 and 65535.',
    );
  });

  it('should throw an error for a port number less than 1', () => {
    const port = '0';
    expect(() => sanitizePort(port)).toThrow(
      'Invalid port number. Port must be a number between 1 and 65535.',
    );
  });

  it('should throw an error for a port number greater than 65535', () => {
    const port = '70000';
    expect(() => sanitizePort(port)).toThrow(
      'Invalid port number. Port must be a number between 1 and 65535.',
    );
  });

  it('should throw an error for restricted ports', () => {
    const port = '443';
    expect(() => sanitizePort(port)).toThrow(
      'Port 443 is restricted and cannot be used.',
    );
  });

  it('should throw an error for additional restricted ports', () => {
    const port = '3000';
    expect(() => sanitizePort(port, [3000])).toThrow(
      'Port 3000 is restricted and cannot be used.',
    );
  });
});

describe('sanitizeContainerName', () => {
  it('should return a valid container name', () => {
    const name = 'valid_container_name';
    const result = sanitizeContainerName(name);
    expect(result).toEqual('valid_container_name');
  });

  it('should remove invalid characters from the container name', () => {
    const name = 'invalid!@#$%^&*()container';
    const result = sanitizeContainerName(name);
    expect(result).toEqual('invalidcontainer');
  });

  it('should throw an error for an empty container name', () => {
    const name = '';
    expect(() => sanitizeContainerName(name)).toThrow(
      'Invalid container name. Container name must be alphanumeric and can include underscores.',
    );
  });

  it('should throw an error for a container name with only invalid characters', () => {
    const name = '!@#$%^&*()';
    expect(() => sanitizeContainerName(name)).toThrow(
      'Invalid container name. Container name must be alphanumeric and can include underscores.',
    );
  });

  it('should allow alphanumeric characters and underscores in the container name', () => {
    const name = 'valid_Container123';
    const result = sanitizeContainerName(name);
    expect(result).toEqual('valid_Container123');
  });
});

describe('sanitizeContainerImage', () => {
  it('should return a valid container image name', () => {
    const image = 'valid_image/name:tag';
    const result = sanitizeContainerImage(image);
    expect(result).toEqual('valid_image/name:tag');
  });

  it('should remove invalid characters from the container image name', () => {
    const image = 'invalid!@#$%^&*()image/name:tag';
    const result = sanitizeContainerImage(image);
    expect(result).toEqual('invalidimage/name:tag');
  });

  it('should throw an error for an empty container image name', () => {
    const image = '';
    expect(() => sanitizeContainerImage(image)).toThrow('Invalid container image name. Image name must be alphanumeric and can include underscores, slashes, colons, and periods.');
  });

  it('should throw an error for a container image name with only invalid characters', () => {
    const image = '!@#$%^&*()';
    expect(() => sanitizeContainerImage(image)).toThrow('Invalid container image name. Image name must be alphanumeric and can include underscores, slashes, colons, and periods.');
  });

  it('should allow alphanumeric characters, underscores, slashes, colons, and periods in the container image name', () => {
    const image = 'valid_image/name:1.0';
    const result = sanitizeContainerImage(image);
    expect(result).toEqual('valid_image/name:1.0');
  });

  it('should allow periods in the container image name', () => {
    const image = 'valid.image/name:1.0';
    const result = sanitizeContainerImage(image);
    expect(result).toEqual('valid.image/name:1.0');
  });
});
