import { ULIDValidationError } from './error/ULIDValidationError';

export function isULID(str: string): boolean {
  const ulidRegex = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

  if (str.length !== 26) {
    throw new ULIDValidationError(
      `Invalid length: ULID must be exactly 26 characters long, but got ${str.length}.`,
    );
  }

  if (!ulidRegex.test(str)) {
    throw new ULIDValidationError(
      'Invalid format: ULID contains invalid characters.',
    );
  }

  return true;
}

export function _isULID(str: string): {
  isValid: boolean;
  error: string | null;
} {
  const ulidRegex = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

  if (str.length !== 26) {
    return {
      isValid: false,
      error: `Invalid length: ULID must be exactly 26 characters long, but got ${str.length}.`,
    };
  }

  if (!ulidRegex.test(str)) {
    return {
      isValid: false,
      error: 'Invalid format: ULID contains invalid characters.',
    };
  }

  return {
    isValid: true,
    error: null,
  };
}
