// utils/debug.ts

//  [IMPORTS]
import { getUserSetting, setUserSetting } from '../localdb';


/**
 * Enables debug mode by setting the 'debugMode' user setting to true.
 * This function modifies the user settings to enable debug mode, allowing debug logs to be shown.
 */
const enableDebugMode = () => {
  setUserSetting('debugMode', true);
};

/**
 * Disables debug mode by setting the 'debugMode' user setting to false.
 * This function modifies the user settings to disable debug mode, preventing debug logs from being shown.
 */
const disableDebugMode = () => {
  setUserSetting('debugMode', false);
};

/**
 * Checks if debug mode is currently enabled.
 * This function retrieves the current value of the 'debugMode' user setting.
 *
 * @returns {boolean} True if debug mode is enabled, false otherwise.
 */
const isDebugModeEnabled = (): boolean => {
  return getUserSetting('debugMode');
};

/**
 * Formats a message for logging.
 * If the input is an object, it is converted to a JSON string with indentation.
 * Otherwise, the message is returned as-is.
 *
 * @param {string | object} message - The message to format, either a string or an object.
 * @returns {string} The formatted message as a string.
 */
const formatMessage = (message: string | object): string => {
  return typeof message === 'string' ? message : JSON.stringify(message, null, 2);
};

/**
 * Logs a message to the console if debug mode is enabled.
 *
 * @param {string | object} message - The message to log, either a string or an object.
 */
const log = (message: string | object) => {
  if (isDebugModeEnabled()) {
    console.log(`[DEBUG] ${formatMessage(message)}`);
  }
};

/**
 * Logs a warning message to the console if debug mode is enabled.
 *
 * @param {string | object} message - The warning message to log, either a string or an object.
 */
const warn = (message: string | object) => {
  if (isDebugModeEnabled()) {
    console.warn(`[DEBUG] ${formatMessage(message)}`);
  }
};

/**
 * Logs an error message to the console if debug mode is enabled.
 * If an `Error` object is provided, it includes the error's message and stack trace.
 *
 * @param {string | object} message - The error message to log, either a string or an object.
 * @param {unknown} [error] - An optional error object, typically of type `Error`.
 */
const error = (message: string | object, error?: unknown) => {
  if (isDebugModeEnabled()) {
    if (error instanceof Error) {
      console.error(`[DEBUG] ${formatMessage(message)} - Error: ${error.message}\n${error.stack}`);
    } else {
      console.error(`[DEBUG] ${formatMessage(message)}`);
    }
  }
};

/**
 * Debug utility object to control and handle debug-related logging.
 * Provides functions to enable or disable debug mode, check if it's enabled,
 * and log messages at different levels (log, warn, error).
 */
export const Debug = {
  enable: enableDebugMode,
  disable: disableDebugMode,
  isEnabled: isDebugModeEnabled,
  log,
  warn,
  error,
};
