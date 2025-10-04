import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { DiscordTheme } from './DiscordService';
import {
  createWidgetSrc,
  resolveInitialTheme,
  subscribeToAutoTheme,
} from './DiscordService';

export interface ReactDiscordEmbedProps {
  serverId: string;
  theme: DiscordTheme;
  title: string;
  frameClassName?: string;
}

const ReactDiscordEmbed = ({
  serverId,
  theme,
  title,
  frameClassName,
}: ReactDiscordEmbedProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTheme, setActiveTheme] = useState<'dark' | 'light'>(() =>
    resolveInitialTheme(theme, 'light', typeof window !== 'undefined' ? window : undefined)
  );

  useEffect(() => {
    if (theme === 'dark' || theme === 'light') {
      setActiveTheme(theme);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    setActiveTheme(resolveInitialTheme('auto', 'light', window));

    const unsubscribe = subscribeToAutoTheme(theme, (nextTheme) => {
      setActiveTheme(nextTheme);
    }, window);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [theme]);

  useEffect(() => {
    setIsLoaded(false);
  }, [activeTheme, serverId]);

  useEffect(() => {
    const container = hostRef.current?.closest('[data-discord-embed]') as HTMLElement | null;
    if (!container) {
      return;
    }

    if (isLoaded) {
      container.setAttribute('data-loaded', '');
    } else {
      container.removeAttribute('data-loaded');
    }
  }, [isLoaded]);

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
      { threshold: 0.15 }
    );

    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  }, []);

  const frameSrc = useMemo(() => createWidgetSrc(serverId, activeTheme), [serverId, activeTheme]);

  return (
    <div
      ref={hostRef}
      className="relative flex h-full w-full flex-col p-2 pb-6"
      role="application"
      aria-label={`Interactive Discord server widget for ${serverId}`}
      aria-busy={!isLoaded}
      aria-live="polite"
    >
      {isVisible ? (
        <iframe
          key={`${serverId}-${activeTheme}`}
          src={frameSrc}
          title={`${title} - Interactive Discord server widget`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          className={clsx(
            'h-full w-full flex-1 border-0 bg-transparent transition-opacity duration-500 ease-out',
            isLoaded ? 'opacity-100' : 'opacity-0',
            frameClassName
          )}
          onLoad={() => setIsLoaded(true)}
          aria-label={`Discord server ${serverId} embedded widget`}
          aria-describedby="discord-widget-description"
          tabIndex={0}
        />
      ) : (
        <span
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-label="Discord widget loading status"
        >
          Loading Discord widget for server {serverId}…
        </span>
      )}
      <span id="discord-widget-description" className="sr-only">
        This is an embedded Discord server widget showing online members and server information.
        Use arrow keys to navigate within the widget.
      </span>
    </div>
  );
};

export default ReactDiscordEmbed;
