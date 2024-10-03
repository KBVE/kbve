//! [REGEX]

// Regular expressions for client-side validation
const _usernameRegex = /^[a-z0-9]{5,24}$/i; // Username: allows letters and numbers, 5-24 characters
const _emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/; // Email: standard email pattern
const _passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[\W_]).{8,}$/; // Password: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char

// Client-side regex validation utility
export const ClientSideRegex = {
  /**
   * Validates a username to ensure it meets the requirements:
   * - Allows alphanumeric characters (a-z, 0-9)
   * - Length: 5 to 24 characters
   */
  validateUsername: (username: string): boolean => {
    return _usernameRegex.test(username);
  },

  /**
   * Validates an email address to ensure it meets the standard format.
   */
  validateEmail: (email: string): boolean => {
    return _emailRegex.test(email);
  },

  /**
   * Validates a password to ensure it meets the requirements:
   * - Minimum 8 characters long
   * - At least one uppercase letter
   * - At least one lowercase letter
   * - At least one number
   * - At least one special character
   */
  validatePassword: (password: string): boolean => {
    return _passwordRegex.test(password);
  },

  /**
   * Provides detailed feedback on why a password might be weak.
   * Returns an array of strings indicating the issues found.
   */
  getWeakPasswordReasons: (password: string): string[] => {
    const reasons: string[] = [];

    if (password.length < 8) reasons.push('Password must be at least 8 characters long.');
    if (!/[A-Z]/.test(password)) reasons.push('Password must contain at least one uppercase letter.');
    if (!/[a-z]/.test(password)) reasons.push('Password must contain at least one lowercase letter.');
    if (!/[0-9]/.test(password)) reasons.push('Password must contain at least one number.');
    if (!/[\W_]/.test(password)) reasons.push('Password must contain at least one special character (e.g., !, @, #, $, etc.).');

    return reasons;
  }
};
