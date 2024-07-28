import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
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
export async function markdownToJsonSafeString(markdownContent: string): Promise<string> {
  // Convert markdown to HTML
  const htmlContent = await marked.parse(markdownContent);



   // Create a JSDOM window for DOMPurify to use
   const window = new JSDOM('').window;
   const DOMPurifyInstance = DOMPurify(window);

  // Sanitize the HTML content
const sanitizedHtmlContent = DOMPurifyInstance.sanitize(htmlContent);


  // Use jsdom to create a temporary DOM element to extract text content from sanitized HTML
  const dom = new JSDOM(sanitizedHtmlContent);
  const textContent = (dom.window.document.body.textContent || '').trim();

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
export async function markdownToJsonSafeStringThenStrip(text: string): Promise<string> {
    const jsonSafeString = await markdownToJsonSafeString(text);
    const strippedString = stripNonAlphanumeric(jsonSafeString);
    return strippedString;
}

/**
 * Converts markdown content to a JSON-safe string using markdownToJsonSafeString.
 * @param markdownContent - The markdown content to convert.
 * @returns JSON-safe string.
 */
export async function _md2json(markdownContent: string): Promise<string> {
    return await markdownToJsonSafeString(markdownContent);
  }

/**
 * Converts markdown content to a JSON-safe string and then strips non-alphanumeric characters.
 * @param markdownContent - The markdown content to convert and strip.
 * @returns Stripped JSON-safe string.
 */
export async function __md2json(markdownContent: string): Promise<string> {
    return await markdownToJsonSafeStringThenStrip(markdownContent);
  }

/**
 * Cleans the title of an issue ticket, checking only the first 64 characters and 
 * stripping out everything besides letters, numbers, periods, hyphens, brackets, and spaces.
 * @param title - The title to clean.
 * @returns Cleaned title.
 */
export function _title(title: string): string {
  // Take the first 64 characters of the title
  const truncatedTitle = title.slice(0, 64);

  // Strip out everything besides letters, numbers, periods, hyphens, brackets, and spaces
  // eslint-disable-next-line no-useless-escape
  const cleanedTitle = truncatedTitle.replace(/[^a-zA-Z0-9.\- \[\]]/g, '');

  return cleanedTitle.trim();
}

/**
 * Makes a string safe for use in a markdown table row.
 * @param row - The string to sanitize.
 * @returns Markdown-safe string.
 */
export async function _md_safe_row(row: string): Promise<string> {
  // Escape special markdown characters to prevent formatting issues
  const mdSafeRow = row
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/\|/g, '\\|')   // Escape pipe characters
    .replace(/_/g, '\\_')    // Escape underscores
    .replace(/\*/g, '\\*')   // Escape asterisks
    .replace(/\[/g, '\\[')   // Escape opening square brackets
    .replace(/\]/g, '\\]')   // Escape closing square brackets
    .replace(/\(/g, '\\(')   // Escape opening parentheses
    .replace(/\)/g, '\\)');  // Escape closing parentheses

  return mdSafeRow;
}


/**
 * Sanitizes the port number ensuring it is a valid number within the valid range (1-65535) 
 * and not one of the restricted ports.
 * @param port - The port number to sanitize.
 * @param additionalRestrictedPorts - An optional array of additional restricted ports.
 * @returns Sanitized port number or throws an error if the port is invalid.
 */
export function sanitizePort(port: number, additionalRestrictedPorts: number[] = []): number {
  const defaultRestrictedPorts = [443, 80, 22];
  const restrictedPorts = [...defaultRestrictedPorts, ...additionalRestrictedPorts];

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Invalid port number. Port must be a number between 1 and 65535.');
  }

  if (restrictedPorts.includes(port)) {
    throw new Error(`Port ${port} is restricted and cannot be used.`);
  }

  return port;
}

/**
 * Sanitizes the container name ensuring it is alphanumeric and can include underscores.
 * @param name - The container name to sanitize.
 * @returns Sanitized container name or throws an error if the name is invalid.
 */
export function sanitizeContainerName(name: string): string {
  const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '');
  
  if (!sanitizedName || sanitizedName.length === 0) {
    throw new Error('Invalid container name. Container name must be alphanumeric and can include underscores.');
  }

  return sanitizedName;
}

/**
 * Sanitizes the container image name ensuring it is alphanumeric and can include underscores, slashes, colons, and periods.
 * @param image - The container image name to sanitize.
 * @returns Sanitized container image name or throws an error if the name is invalid.
 */
export function sanitizeContainerImage(image: string): string {
  const sanitizedImage = image.replace(/[^a-zA-Z0-9_:/.]/g, '');

  if (!sanitizedImage || sanitizedImage.length === 0) {
    throw new Error('Invalid container image name. Image name must be alphanumeric and can include underscores, slashes, colons, and periods.');
  }

  return sanitizedImage;
}
