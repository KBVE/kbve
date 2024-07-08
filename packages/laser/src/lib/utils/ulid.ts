
const crockford32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function padStart(str: string, length: number, pad: string): string {
  while (str.length < length) {
    str = pad + str;
  }
  return str;
}

function randomChar(): string {
  const random = Math.floor(Math.random() * crockford32.length);
  return crockford32.charAt(random);
}

function randomChars(count: number): string {
  let str = '';
  for (let i = 0; i < count; i++) {
    str += randomChar();
  }
  return str;
}

function encodeTime(time: number, length: number): string {
  let str = '';
  for (let i = length - 1; i >= 0; i--) {
    const mod = time % crockford32.length;
    str = crockford32.charAt(mod) + str;
    time = Math.floor(time / crockford32.length);
  }
  return padStart(str, length, crockford32[0]);
}

export function createULID(): string {
  const timestamp = Date.now();
  const timePart = encodeTime(timestamp, 10);
  const randomPart = randomChars(16);
  return timePart + randomPart;
}
