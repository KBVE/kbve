import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { IRCTheme, IRCConnectionParams } from './ircService';
import {
  createIRCUrl,
  resolveInitialTheme,
  subscribeToAutoTheme,
  generateGuestUsername,
  generateGuestNick,
  validateConnectionParams,
  isUserAuthenticated,
  getAuthenticatedUserParams,
  subscribeToAuthChanges,
} from './ircService';

export interface ReactIRCEmbedProps {
  /** Base URL for IRC client */
  baseUrl?: string;
  /** Theme setting */
  theme: IRCTheme;
  /** Title for accessibility */
  title: string;
  /** Connection parameters */
  connectionParams?: IRCConnectionParams;
  /** Frame class name */
  frameClassName?: string;
  /** Generate guest credentials if none provided */
  autoGenerateGuest?: boolean;
  /** Height of the iframe */
  height?: number | string;
  /** Auto-size the iframe */
  autosize?: boolean;
  /** Require authentication to use chat */
  requireAuth?: boolean;
}

const ReactIRCEmbed = ({
  baseUrl = 'https://chat.kbve.com',
  theme,
  title,
  connectionParams,
  frameClassName,
  autoGenerateGuest = false,
  height,
  autosize = false,
  requireAuth = true,
}: ReactIRCEmbedProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTheme, setActiveTheme] = useState<'dark' | 'light'>(() =>
    resolveInitialTheme(theme, 'dark', typeof window !== 'undefined' ? window : undefined)
  );

  // Check authentication status
  useEffect(() => {
    if (!requireAuth) {
      setIsAuthenticated(true);
      return;
    }

    // Check initial auth state
    setIsAuthenticated(isUserAuthenticated());

    // Subscribe to auth changes
    const unsubscribe = subscribeToAuthChanges((authenticated) => {
      setIsAuthenticated(authenticated);
    });

    return unsubscribe;
  }, [requireAuth]);

  // Generate connection parameters
  const finalConnectionParams = useMemo(() => {
    // If authenticated, use user params
    if (isAuthenticated && requireAuth) {
      const authParams = getAuthenticatedUserParams();
      if (authParams) {
        return authParams;
      }
    }

    // Otherwise use provided params or generate guest
    if (!connectionParams && !autoGenerateGuest) {
      return undefined;
    }

    const params = { ...connectionParams };

    // Auto-generate guest credentials if needed
    if (autoGenerateGuest && !params.username) {
      params.username = generateGuestUsername();
      params.nick = params.nick || generateGuestNick();
      params.realname = params.realname || 'Guest User';
    }

    // Validate parameters
    if (params && !validateConnectionParams(params)) {
      console.warn('Invalid IRC connection parameters', params);
      return undefined;
    }

    return params;
  }, [connectionParams, autoGenerateGuest, isAuthenticated, requireAuth]);

  // Generate iframe src URL
  useEffect(() => {
    const url = createIRCUrl(finalConnectionParams, baseUrl);
    setIframeSrc(url);
  }, [finalConnectionParams, baseUrl]);

  // Handle theme changes
  useEffect(() => {
    if (theme === 'dark' || theme === 'light') {
      setActiveTheme(theme);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    setActiveTheme(resolveInitialTheme('auto', 'dark', window));

    const unsubscribe = subscribeToAutoTheme(theme, (nextTheme) => {
      setActiveTheme(nextTheme);
    }, window);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [theme]);

  // Reset loaded state when src changes
  useEffect(() => {
    setIsLoaded(false);
  }, [iframeSrc]);

  // Update parent container loaded state
  useEffect(() => {
    const container = hostRef.current?.closest('[data-irc-embed]') as HTMLElement | null;
    if (!container) {
      return;
    }

    if (isLoaded) {
      container.setAttribute('data-loaded', 'true');
    } else {
      container.removeAttribute('data-loaded');
    }
  }, [isLoaded]);

  // Intersection observer for lazy loading
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const host = hostRef.current;
    if (!host) {
      return;
    }

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Handle iframe load event
  const handleIframeLoad = () => {
    setIsLoaded(true);

    // Send theme preference to iframe if possible
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'theme-change',
            theme: activeTheme,
          },
          baseUrl
        );
      } catch (error) {
        console.debug('Could not send theme to IRC iframe:', error);
      }
    }
  };

  // Calculate iframe height
  const iframeHeight = useMemo(() => {
    if (autosize) {
      return '100%';
    }
    if (typeof height === 'number') {
      return `${height}px`;
    }
    return height || '100%';
  }, [height, autosize]);

  // Login modal component
  const LoginModal = () => (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: activeTheme === 'dark' ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="max-w-md w-full mx-4 p-8 rounded-2xl shadow-2xl bg-zinc-900 dark:bg-zinc-900 light:bg-white border border-zinc-800 dark:border-zinc-800 light:border-gray-200">
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 text-blue-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h2 className="text-2xl font-bold mb-2 text-white dark:text-white light:text-gray-900">
            Authentication Required
          </h2>
          <p className="text-gray-400 dark:text-gray-400 light:text-gray-600 mb-6">
            Please log in to access the KBVE chat room. Your profile information will be used to automatically connect you to IRC.
          </p>
          <div className="space-y-4">
            <a
              href="/login"
              className="block w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Log In
            </a>
            <a
              href="/register"
              className="block w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 light:bg-gray-200 light:hover:bg-gray-300 text-white dark:text-white light:text-gray-900 rounded-lg font-medium transition-colors"
            >
              Create Account
            </a>
          </div>
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-500 light:text-gray-400">
            By logging in, you agree to our terms of service and community guidelines.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={hostRef}
      className="irc-embed-host"
      data-theme={activeTheme}
      style={{ height: '100%', width: '100%', position: 'relative' }}
    >
      {!isAuthenticated && requireAuth && <LoginModal />}

      {isVisible && iframeSrc && (isAuthenticated || !requireAuth) && (
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={title}
          className={clsx('irc-iframe', frameClassName)}
          style={{
            border: 0,
            width: '100%',
            height: iframeHeight,
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          onLoad={handleIframeLoad}
          allow="clipboard-write"
        />
      )}

      {!isVisible && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mb-3"></div>
            <p className="text-sm text-zinc-400">Loading chat...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReactIRCEmbed;