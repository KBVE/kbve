// ulid.ts

// Define the Crockford Base32 encoding characters
const crockford32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Helper function to pad a string to the desired length.
 * @param str The string to be padded.
 * @param length The desired length of the string.
 * @param pad The character used for padding.
 * @returns A string padded with the specified character.
 */
function padStart(str: string, length: number, pad: string): string {
  while (str.length < length) {
    str = pad + str;
  }
  return str;
}

/**
 * Generates a single random character from the Crockford32 character set.
 * @returns A single random character.
 */
function randomChar(): string {
  const random = Math.floor(Math.random() * crockford32.length);
  return crockford32.charAt(random);
}

/**
 * Generates a string of random characters of the given count.
 * @param count Number of random characters to generate.
 * @returns A string of random characters.
 */
function randomChars(count: number): string {
  let str = '';
  for (let i = 0; i < count; i++) {
    str += randomChar();
  }
  return str;
}

/**
 * Encodes the given timestamp into a string using Crockford's Base32.
 * @param time Timestamp to encode.
 * @param length Desired length of the encoded time string.
 * @returns The encoded time string.
 */
function encodeTime(time: number, length: number): string {
  let str = '';
  for (let i = length - 1; i >= 0; i--) {
    const mod = time % crockford32.length;
    str = crockford32.charAt(mod) + str;
    time = Math.floor(time / crockford32.length);
  }
  return padStart(str, length, crockford32[0]);
}


/**
 * ULID Factory function that returns an object with methods to create ULIDs.
 * Provides a default `toString` method to return the ULID string directly.
 * @returns A ULID string by default, and a chained object with `toString` method.
 */
function ULIDFactory() {
  
  const timestamp = Date.now();
  const timePart = encodeTime(timestamp, 10);
  const randomPart = randomChars(16);
  const ulidString = timePart + randomPart;

  // Return an object that behaves like a string
  const ulidObject = {
    toString: () => ulidString,
    valueOf: () => ulidString,
  };

  return ulidObject;

}

// Export the ULIDFactory as the default export
export default ULIDFactory;
