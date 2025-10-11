import { userClientService, userProfileService } from '@kbve/astropad';
import type { User } from '@supabase/supabase-js';

/**
 * IRC Theme options
 * @type {'dark' | 'light' | 'auto'}
 */
export type IRCTheme = 'dark' | 'light' | 'auto';

/**
 * IRC connection parameters
 * @interface IRCConnectionParams
 */
export interface IRCConnectionParams {
  username?: string;
  nick?: string;
  realname?: string;
  password?: string;
  channels?: string[];
  autoConnect?: boolean;
}

/**
 * Configuration options for IRC embed
 * @interface IRCEmbedOptions
 */
export interface IRCEmbedOptions {
  baseUrl?: string;
  theme?: IRCTheme;
  connectionParams?: IRCConnectionParams;
}

const IRC_BASE_URL = 'https://chat.kbve.com';

/**
 * Creates the IRC embed URL with connection parameters
 * @param {IRCConnectionParams} params - Connection parameters
 * @param {string} baseUrl - Base URL for the IRC client
 * @returns {string} Complete IRC embed URL with parameters
 */
export const createIRCUrl = (
  params?: IRCConnectionParams,
  baseUrl: string = IRC_BASE_URL
): string => {
  const url = new URL(baseUrl);

  // Add hash route for connect page if we have parameters
  if (params && Object.keys(params).length > 0) {
    url.hash = '/connect';

    const searchParams = new URLSearchParams();

    if (params.username) {
      searchParams.append('username', params.username);
    }

    if (params.nick) {
      searchParams.append('nick', params.nick);
    }

    if (params.realname) {
      searchParams.append('realname', params.realname);
    }

    if (params.password) {
      searchParams.append('password', params.password);
    }

    if (params.channels && params.channels.length > 0) {
      searchParams.append('channels', params.channels.join(','));
    }

    if (params.autoConnect) {
      searchParams.append('checkbox', 'checked');
    }

    const queryString = searchParams.toString();
    if (queryString) {
      url.hash += '?' + queryString;
    }
  }

  return url.toString();
};

/**
 * Generates a guest username based on timestamp
 * @returns {string} Guest username
 */
export const generateGuestUsername = (): string => {
  const timestamp = Date.now().toString(36).substring(2, 8);
  return `guest_${timestamp}`;
};

/**
 * Generates a guest nickname
 * @returns {string} Guest nickname
 */
export const generateGuestNick = (): string => {
  const randomId = Math.random().toString(36).substring(2, 8);
  return `user_${randomId}`;
};

/**
 * Creates dimension string from number or string value
 * @param {number | string | undefined} value - Dimension value
 * @returns {string | undefined} Formatted dimension string
 */
const dimensionToString = (value: number | string | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'number' ? `${value}px` : value;
};

/**
 * Creates inline style object or string
 * @param {number | string | undefined} width - Width value
 * @param {number | string | undefined} height - Height value
 * @param {string | undefined} aspect - Aspect ratio class
 * @returns {string | undefined} Style string
 */
export const createInlineStyle = (
  width?: number | string,
  height?: number | string,
  aspect?: string
): string | undefined => {
  const widthValue = dimensionToString(width) ?? '100%';
  const heightValue = dimensionToString(height) ?? '750px';

  if (aspect && aspect.trim().length > 0) {
    return `width:${widthValue};`;
  }

  return `width:${widthValue};height:${heightValue};`;
};

/**
 * Checks if user prefers dark mode
 * @param {Window} targetWindow - Target window object
 * @returns {boolean} True if user prefers dark mode
 */
const prefersDark = (targetWindow?: Window): boolean => {
  if (!targetWindow?.matchMedia) {
    return false;
  }

  return targetWindow.matchMedia('(prefers-color-scheme: dark)').matches;
};

/**
 * Resolves theme based on user preference
 * @param {IRCTheme} theme - Theme setting
 * @param {'dark' | 'light'} fallback - Fallback theme
 * @param {Window} targetWindow - Target window object
 * @returns {'dark' | 'light'} Resolved theme
 */
export const resolveInitialTheme = (
  theme: IRCTheme,
  fallback: 'dark' | 'light' = 'dark',
  targetWindow?: Window
): 'dark' | 'light' => {
  if (theme === 'dark' || theme === 'light') {
    return theme;
  }

  return prefersDark(targetWindow) ? 'dark' : fallback;
};

/**
 * Subscribes to system theme changes
 * @param {IRCTheme} theme - Current theme setting
 * @param {Function} handler - Callback when theme changes
 * @param {Window} targetWindow - Target window object
 * @returns {Function | undefined} Cleanup function
 */
export const subscribeToAutoTheme = (
  theme: IRCTheme,
  handler: (theme: 'dark' | 'light') => void,
  targetWindow?: Window
): (() => void) | undefined => {
  if (theme !== 'auto' || !targetWindow?.matchMedia) {
    return undefined;
  }

  const mediaQuery = targetWindow.matchMedia('(prefers-color-scheme: dark)');
  const listener = (event: MediaQueryListEvent | MediaQueryList) => {
    const next = 'matches' in event ? event.matches : mediaQuery.matches;
    handler(next ? 'dark' : 'light');
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }

  if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }

  return undefined;
};

/**
 * Validates IRC connection parameters
 * @param {IRCConnectionParams} params - Connection parameters to validate
 * @returns {boolean} True if parameters are valid
 */
export const validateConnectionParams = (params: IRCConnectionParams): boolean => {
  if (params.username && params.username.length > 32) {
    return false;
  }

  if (params.nick && params.nick.length > 32) {
    return false;
  }

  if (params.realname && params.realname.length > 128) {
    return false;
  }

  return true;
};

/**
 * Check if user is authenticated via Supabase
 * @returns {boolean} True if user is authenticated
 */
export const isUserAuthenticated = (): boolean => {
  const user = userClientService.userAtom.get();
  return !!user;
};

/**
 * Get current authenticated user
 * @returns {User | null} Current user or null
 */
export const getCurrentUser = (): User | null => {
  return userClientService.userAtom.get();
};

/**
 * Get IRC connection parameters from authenticated user
 * @returns {IRCConnectionParams | null} Connection params or null if not authenticated
 */
export const getAuthenticatedUserParams = (): IRCConnectionParams | null => {
  const user = getCurrentUser();
  if (!user) {
    return null;
  }

  // Get username from persistent atom or user metadata
  const username = userClientService.usernameAtom.get() ||
                   userClientService.userNamePersistentAtom.get() ||
                   user.user_metadata?.username ||
                   user.email?.split('@')[0] ||
                   'user';

  // Create IRC-safe username (alphanumeric and underscore only)
  const ircUsername = username.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32);

  // Get display name from user metadata or email
  const displayName = user.user_metadata?.full_name ||
                     user.user_metadata?.name ||
                     username;

  return {
    username: ircUsername,
    nick: ircUsername,
    realname: displayName,
    password: 'test', // Using test password for now as requested
    channels: ['#general', '#kbve'], // Default channels
    autoConnect: true
  };
};

/**
 * Subscribe to authentication state changes
 * @param {Function} callback - Function to call when auth state changes
 * @returns {Function} Unsubscribe function
 */
export const subscribeToAuthChanges = (callback: (isAuthenticated: boolean) => void): () => void => {
  // Subscribe to user atom changes
  const unsubscribe = userClientService.userAtom.subscribe((user) => {
    callback(!!user);
  });

  // Call immediately with current state
  callback(isUserAuthenticated());

  return unsubscribe;
};