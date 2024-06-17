
// Regular expression to match ULID pattern
const ULID_REGEX = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

/**
 * Checks if a given string is a valid ULID.
 * @param ulid - The string to check.
 * @returns true if the string is a valid ULID, false otherwise.
 */
export function _isULID(ulid: string): boolean {
    if (typeof ulid !== 'string') {
        return false;
    }
    if (ulid.length !== 26) {
        return false;
    }
    return ULID_REGEX.test(ulid.toUpperCase());
}