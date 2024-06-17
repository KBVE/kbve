import { JSDOM } from 'jsdom';
import * as DOMPurify from 'dompurify';
import { marked } from 'marked';

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

/**
 * Converts markdown to a JSON-safe string.
 * @param markdownContent - The markdown content to convert.
 * @returns JSON-safe string.
 */
export function markdownToJsonSafeString(markdownContent: string): string {
  // Convert markdown to HTML
  const htmlContent = marked.parse(markdownContent);

  // Sanitize the HTML content
  const sanitizedHtmlContent = DOMPurify.sanitize(htmlContent);

  // Use jsdom to create a temporary DOM element to extract text content from sanitized HTML
  const dom = new JSDOM(sanitizedHtmlContent);
  const textContent = dom.window.document.body.textContent || '';

  // Ensure the text content is JSON-safe
  const jsonSafeString = JSON.stringify(textContent);

  return jsonSafeString;
}

/**
 * Strips everything except alphanumeric characters, spaces, and periods.
 * @param text - The text to strip.
 * @returns Stripped text.
 */
export function stripNonAlphanumeric(text: string): string {
  return text.replace(/[^a-zA-Z0-9 .]/g, '');
}

/**
 * Composite function for sanitization level 9.
 * @param text - The text to sanitize.
 * @returns Sanitized text.
 */
export function markdownToJsonSafeStringThenStrip(text: string): string {
  const jsonSafeString = markdownToJsonSafeString(text);
  return stripNonAlphanumeric(jsonSafeString);
}
