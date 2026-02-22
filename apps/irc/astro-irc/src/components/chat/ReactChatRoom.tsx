/** @jsxImportSource react */
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { useStore } from '@nanostores/react';
import { cn } from '@kbve/astro';

import {
  $connectionStatus,
  $activeChannel,
  $channelList,
  $activeMessages,
  $activeUsers,
  $nick,
  $error,
  onMessage,
  connect,
  disconnect,
  sendMessage,
  switchChannel,
  joinChannel,
  partChannel,
  type ChatMessage,
  type ConnectionStatus,
} from './service';

const STATUS_DOT: Record<ConnectionStatus, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-[var(--sl-color-gray-4)]',
  error: 'bg-red-500',
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting...',
  disconnected: 'Disconnected',
  error: 'Error',
};

const NICK_COLORS = [
  'text-rose-400',
  'text-orange-400',
  'text-amber-400',
  'text-lime-400',
  'text-emerald-400',
  'text-teal-400',
  'text-cyan-400',
  'text-sky-400',
  'text-violet-400',
  'text-fuchsia-400',
  'text-pink-400',
  'text-indigo-400',
];

function nickColor(nick: string): string {
  let hash = 0;
  for (let i = 0; i < nick.length; i++) {
    hash = nick.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createMessageNode(msg: ChatMessage): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'flex gap-2 py-0.5 px-2 hover:bg-[var(--sl-color-bg-accent)]/30 rounded text-sm leading-relaxed';

  const time = document.createElement('span');
  time.className = 'shrink-0 text-[var(--sl-color-gray-4)] text-xs mt-0.5 select-none';
  time.textContent = formatTime(msg.timestamp);

  if (msg.type === 'message') {
    const nick = document.createElement('span');
    nick.className = `shrink-0 font-semibold ${nickColor(msg.nick)}`;
    nick.textContent = msg.nick;

    const content = document.createElement('span');
    content.className = 'text-[var(--sl-color-text)] break-words min-w-0';
    content.textContent = msg.content;

    row.append(time, nick, content);
  } else {
    const content = document.createElement('span');
    content.className = 'text-[var(--sl-color-gray-3)] italic';
    content.textContent = msg.content;
    row.append(time, content);
  }

  return row;
}

const MessageFeed: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const activeChannel = useStore($activeChannel);
  const initialMessages = useStore($activeMessages);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = '';
    for (const msg of initialMessages) {
      el.appendChild(createMessageNode(msg));
    }
    el.scrollTop = el.scrollHeight;
  }, [activeChannel, initialMessages]);

  useEffect(() => {
    return onMessage((msg) => {
      const el = containerRef.current;
      if (!el) return;
      if (msg.channel !== $activeChannel.get()) return;

      el.appendChild(createMessageNode(msg));

      if (isNearBottom.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        'flex-1 overflow-y-auto overflow-x-hidden',
        'font-mono text-sm',
        'scrollbar-thin scrollbar-thumb-[var(--sl-color-gray-5)] scrollbar-track-transparent',
      )}
    />
  );
};

const ChatInput: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const status = useStore($connectionStatus);
  const nick = useStore($nick);
  const disabled = status !== 'connected';

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!value.trim() || disabled) return;

      const trimmed = value.trim();
      if (trimmed.startsWith('/join ')) {
        const ch = trimmed.slice(6).trim();
        if (ch) joinChannel(ch.startsWith('#') ? ch : `#${ch}`);
      } else if (trimmed.startsWith('/part')) {
        const ch = trimmed.slice(5).trim();
        partChannel(ch || $activeChannel.get());
      } else if (trimmed.startsWith('/nick ')) {
        const kbve = (window as any).kbve;
        if (kbve?.ws) {
          const encoder = new TextEncoder();
          kbve.ws.send(encoder.encode(`NICK ${trimmed.slice(6).trim()}\r\n`));
        }
      } else {
        sendMessage(trimmed);
      }

      setValue('');
      inputRef.current?.focus();
    },
    [value, disabled],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-[var(--sl-color-border)]">
      <span className="self-center text-sm font-semibold text-[var(--sl-color-accent)] select-none">
        {nick || '...'}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={disabled ? 'Not connected' : 'Type a message...'}
        disabled={disabled}
        className={cn(
          'flex-1 px-3 py-2 rounded-lg text-sm',
          'bg-[var(--sl-color-bg-accent)] text-[var(--sl-color-text)]',
          'border border-[var(--sl-color-border)]',
          'placeholder:text-[var(--sl-color-gray-3)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--sl-color-accent)]',
          'transition-colors',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className={cn(
          'px-4 py-2 rounded-lg text-sm font-medium',
          'bg-[var(--sl-color-accent)] text-white',
          'hover:opacity-90 transition-opacity',
          (disabled || !value.trim()) && 'opacity-40 cursor-not-allowed',
        )}
      >
        Send
      </button>
    </form>
  );
};

const ChannelSidebar: React.FC = () => {
  const channels = useStore($channelList);
  const active = useStore($activeChannel);
  const [joinInput, setJoinInput] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  const handleJoin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!joinInput.trim()) return;
      const ch = joinInput.trim();
      joinChannel(ch.startsWith('#') ? ch : `#${ch}`);
      setJoinInput('');
      setShowJoin(false);
    },
    [joinInput],
  );

  return (
    <div className="w-48 shrink-0 border-r border-[var(--sl-color-border)] flex flex-col">
      <div className="p-3 border-b border-[var(--sl-color-border)] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--sl-color-gray-3)]">
          Channels
        </span>
        <button
          onClick={() => setShowJoin(!showJoin)}
          className="text-[var(--sl-color-accent)] hover:opacity-80 text-lg leading-none"
          title="Join channel"
        >
          +
        </button>
      </div>

      {showJoin && (
        <form onSubmit={handleJoin} className="p-2 border-b border-[var(--sl-color-border)]">
          <input
            type="text"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="#channel"
            autoFocus
            className={cn(
              'w-full px-2 py-1 rounded text-sm',
              'bg-[var(--sl-color-bg-accent)] text-[var(--sl-color-text)]',
              'border border-[var(--sl-color-border)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--sl-color-accent)]',
            )}
          />
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {channels.map((ch) => (
          <button
            key={ch.name}
            onClick={() => switchChannel(ch.name)}
            className={cn(
              'w-full text-left px-3 py-2 text-sm transition-colors',
              'hover:bg-[var(--sl-color-bg-accent)]',
              active === ch.name
                ? 'bg-[var(--sl-color-bg-accent)] text-[var(--sl-color-accent)] font-semibold'
                : 'text-[var(--sl-color-text)]',
            )}
          >
            <span>{ch.name}</span>
            {ch.unread > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-[var(--sl-color-accent)] text-white">
                {ch.unread}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

const UserList: React.FC = () => {
  const users = useStore($activeUsers);

  if (users.length === 0) return null;

  return (
    <div className="w-40 shrink-0 border-l border-[var(--sl-color-border)] flex flex-col">
      <div className="p-3 border-b border-[var(--sl-color-border)]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--sl-color-gray-3)]">
          Users ({users.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {users.map((user) => (
          <div
            key={user}
            className="px-3 py-1.5 text-sm text-[var(--sl-color-text)] truncate"
          >
            {user}
          </div>
        ))}
      </div>
    </div>
  );
};

const StatusBar: React.FC<{ wsUrl: string }> = ({ wsUrl }) => {
  const status = useStore($connectionStatus);
  const error = useStore($error);
  const activeChannel = useStore($activeChannel);

  const handleConnect = useCallback(() => {
    if (status === 'connected') {
      disconnect();
    } else {
      connect(wsUrl);
    }
  }, [status, wsUrl]);

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--sl-color-border)] bg-[var(--sl-color-bg-accent)]/50">
      <div className="flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full', STATUS_DOT[status])} />
        <span className="text-xs text-[var(--sl-color-gray-3)]">
          {STATUS_LABEL[status]}
        </span>
      </div>

      <span className="text-xs font-semibold text-[var(--sl-color-accent)]">
        {activeChannel}
      </span>

      {error && (
        <span className="text-xs text-red-400 truncate flex-1">{error}</span>
      )}

      <button
        onClick={handleConnect}
        className={cn(
          'ml-auto px-3 py-1 rounded text-xs font-medium transition-colors',
          status === 'connected'
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            : 'bg-[var(--sl-color-accent)]/20 text-[var(--sl-color-accent)] hover:bg-[var(--sl-color-accent)]/30',
        )}
      >
        {status === 'connected' ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  );
};

export interface ReactChatRoomProps {
  wsUrl?: string;
}

export const ReactChatRoom: React.FC<ReactChatRoomProps> = ({
  wsUrl = 'wss://chat.kbve.com/ws',
}) => {
  return (
    <div
      className={cn(
        'flex flex-col',
        'w-full h-[600px]',
        'rounded-xl overflow-hidden',
        'border border-[var(--sl-color-border)]',
        'bg-[var(--sl-color-bg)]',
      )}
    >
      <StatusBar wsUrl={wsUrl} />

      <div className="flex flex-1 min-h-0">
        <ChannelSidebar />

        <div className="flex flex-col flex-1 min-w-0">
          <MessageFeed />
          <ChatInput />
        </div>

        <UserList />
      </div>
    </div>
  );
};
