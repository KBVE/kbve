// ulid.ts
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32

function randomChar() {
    return ENCODING[Math.floor(Math.random() * ENCODING.length)];
}

function padTime(time: number, length: number): string {
    let result = time.toString(32).toUpperCase(); // Convert to Base32
    while (result.length < length) {
        result = '0' + result;
    }
    return result;
}

export function generateULID(): string {
    const now = Date.now(); // Timestamp in milliseconds
    const time = padTime(now, 10); // Pad time to 10 characters

    let randomPart = '';
    for (let i = 0; i < 16; i++) {
        randomPart += randomChar(); // 16 random characters
    }

    return time + randomPart; // Combine time and random part
}
