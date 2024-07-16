import { createULID } from './ulid';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-07-14T00:00:00Z'));
});

describe('ULID Generator', () => {
  it('should generate a ULID of correct length', () => {
    const ulid = createULID();
    expect(ulid).toHaveLength(26); // ULID should be 26 characters long
  });

  it('should generate unique ULIDs', () => {
    const ulid1 = createULID();
    const ulid2 = createULID();
    expect(ulid1).not.toBe(ulid2);
  });

  it('should encode the current timestamp in the first 10 characters', () => {
    const timestamp = Date.now();
    const expectedTimePart = encodeTime(timestamp, 10);
    const ulid = createULID();
    expect(ulid.slice(0, 10)).toBe(expectedTimePart);
  });

  it('should generate random characters for the last 16 characters', () => {
    const ulid = createULID();
    const randomPart = ulid.slice(10);
    expect(randomPart).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{16}$/);
  });
});

function encodeTime(time: number, length: number): string {
  const crockford32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let str = '';
  for (let i = length - 1; i >= 0; i--) {
    const mod = time % crockford32.length;
    str = crockford32.charAt(mod) + str;
    time = Math.floor(time / crockford32.length);
  }
  while (str.length < length) {
    str = crockford32[0] + str;
  }
  return str;
}
