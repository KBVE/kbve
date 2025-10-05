import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { twitchService } from './ServiceTwitch';

export interface ReactTwitchChatProps {
  channel: string;
  theme?: 'dark' | 'light' | 'auto';
  height?: number | string;
  darkpopout?: boolean;
}

const ReactTwitchChat: React.FC<ReactTwitchChatProps> = ({
  channel,
  theme = 'auto',
  height = 500,
  darkpopout = true,
}) => {
  const chatFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [chatUrl, setChatUrl] = useState<string>('');

  useEffect(() => {
    // Determine parent domain
    const parentDomain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    // Resolve theme
    const resolvedTheme = theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

    // Build chat URL
    const params = new URLSearchParams({
      parent: parentDomain,
      darkpopout: (darkpopout || resolvedTheme === 'dark') ? 'true' : 'false'
    });

    setChatUrl(`https://www.twitch.tv/embed/${channel}/chat?${params.toString()}`);
  }, [channel, theme, darkpopout]);

  const handleChatLoad = useCallback(() => {
    setChatLoaded(true);
  }, []);

  const heightValue = typeof height === 'number' ? `${height}px` : height;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 shadow-2xl"
         style={{ height: heightValue }}>
      {/* Loading State */}
      {!chatLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mb-3"></div>
            <p className="text-sm text-zinc-400">Loading chat...</p>
          </div>
        </div>
      )}

      {/* Chat iframe */}
      {chatUrl && (
        <iframe
          ref={chatFrameRef}
          src={chatUrl}
          title={`${channel} - Twitch chat`}
          className="w-full h-full border-0"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          onLoad={handleChatLoad}
          style={{
            opacity: chatLoaded ? 1 : 0,
            transition: 'opacity 0.5s ease-out',
          }}
          aria-label={`Twitch chat for ${channel}`}
        />
      )}
    </div>
  );
};

export default ReactTwitchChat;