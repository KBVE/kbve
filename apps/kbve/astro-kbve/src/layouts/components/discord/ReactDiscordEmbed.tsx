import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  DiscordTheme,
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
    <div ref={hostRef} className="relative flex h-full w-full flex-col">
      {isVisible ? (
        <iframe
          key={`${serverId}-${activeTheme}`}
          src={frameSrc}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          className={clsx(
            'h-full w-full flex-1 border-0 bg-transparent transition-opacity duration-500 ease-out',
            isLoaded ? 'opacity-100' : 'opacity-0',
            frameClassName
          )}
          onLoad={() => setIsLoaded(true)}
        />
      ) : (
        <span className="sr-only">Loading Discord widget…</span>
      )}
    </div>
  );
};

export default ReactDiscordEmbed;
