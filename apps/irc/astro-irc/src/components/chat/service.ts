import { atom, computed } from 'nanostores';

export interface ChatMessage {
  id: string;
  nick: string;
  content: string;
  channel: string;
  timestamp: number;
  type: 'message' | 'join' | 'part' | 'system';
}

export interface ChannelState {
  name: string;
  topic: string;
  users: string[];
  unread: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export const $connectionStatus = atom<ConnectionStatus>('disconnected');
export const $activeChannel = atom<string>('#general');
export const $channels = atom<Map<string, ChannelState>>(new Map());
export const $nick = atom<string>('');
export const $error = atom<string>('');

const $messageStore = atom<Map<string, ChatMessage[]>>(new Map());

export const $activeMessages = computed(
  [$messageStore, $activeChannel],
  (store, channel) => store.get(channel) ?? [],
);

export const $channelList = computed([$channels], (channels) =>
  Array.from(channels.values()).sort((a, b) => a.name.localeCompare(b.name)),
);

export const $activeUsers = computed(
  [$channels, $activeChannel],
  (channels, active) => channels.get(active)?.users ?? [],
);

type MessageListener = (msg: ChatMessage) => void;
const listeners = new Set<MessageListener>();

export function onMessage(fn: MessageListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const MAX_MESSAGES_PER_CHANNEL = 500;

function pushMessage(msg: ChatMessage): void {
  const store = new Map($messageStore.get());
  const msgs = store.get(msg.channel) ?? [];
  const updated = [...msgs, msg].slice(-MAX_MESSAGES_PER_CHANNEL);
  store.set(msg.channel, updated);
  $messageStore.set(store);

  for (const fn of listeners) fn(msg);

  if (msg.channel !== $activeChannel.get() && msg.type === 'message') {
    const channels = new Map($channels.get());
    const ch = channels.get(msg.channel);
    if (ch) {
      channels.set(msg.channel, { ...ch, unread: ch.unread + 1 });
      $channels.set(channels);
    }
  }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function systemMessage(channel: string, content: string): void {
  pushMessage({
    id: makeId(),
    nick: '',
    content,
    channel,
    timestamp: Date.now(),
    type: 'system',
  });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function connect(wsUrl: string): Promise<void> {
  if ($connectionStatus.get() === 'connected') return;

  $connectionStatus.set('connecting');
  $error.set('');

  try {
    const kbve = (window as any).kbve;
    if (!kbve?.ws) {
      throw new Error('Droid WebSocket worker not initialized');
    }

    await kbve.ws.connect(wsUrl);

    kbve.ws.onStatus((status: string) => {
      if (status === 'connected') {
        $connectionStatus.set('connected');
        systemMessage($activeChannel.get(), 'Connected to IRC');
      } else if (status === 'disconnected' || status === 'error') {
        $connectionStatus.set(status as ConnectionStatus);
      }
    });

    kbve.ws.onMessage((data: ArrayBuffer | Uint8Array | string) => {
      const text = typeof data === 'string' ? data : decoder.decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
      handleIncoming(text);
    });
  } catch (err: any) {
    $connectionStatus.set('error');
    $error.set(err.message ?? 'Connection failed');
  }
}

export async function disconnect(): Promise<void> {
  try {
    const kbve = (window as any).kbve;
    if (kbve?.ws) await kbve.ws.close();
  } finally {
    $connectionStatus.set('disconnected');
    systemMessage($activeChannel.get(), 'Disconnected from IRC');
  }
}

export async function sendMessage(content: string): Promise<void> {
  const channel = $activeChannel.get();
  const nick = $nick.get();

  if (!content.trim()) return;

  const kbve = (window as any).kbve;
  if (!kbve?.ws) return;

  const raw = `PRIVMSG ${channel} :${content}\r\n`;
  await kbve.ws.send(encoder.encode(raw));

  pushMessage({
    id: makeId(),
    nick,
    content,
    channel,
    timestamp: Date.now(),
    type: 'message',
  });
}

export function switchChannel(channel: string): void {
  $activeChannel.set(channel);

  const channels = new Map($channels.get());
  const ch = channels.get(channel);
  if (ch) {
    channels.set(channel, { ...ch, unread: 0 });
    $channels.set(channels);
  }
}

export function joinChannel(channel: string): void {
  const kbve = (window as any).kbve;
  if (!kbve?.ws) return;

  const raw = `JOIN ${channel}\r\n`;
  kbve.ws.send(encoder.encode(raw));

  const channels = new Map($channels.get());
  if (!channels.has(channel)) {
    channels.set(channel, { name: channel, topic: '', users: [], unread: 0 });
    $channels.set(channels);
  }
  switchChannel(channel);
}

export function partChannel(channel: string): void {
  const kbve = (window as any).kbve;
  if (!kbve?.ws) return;

  const raw = `PART ${channel}\r\n`;
  kbve.ws.send(encoder.encode(raw));

  const channels = new Map($channels.get());
  channels.delete(channel);
  $channels.set(channels);

  const remaining = Array.from(channels.keys());
  if (remaining.length > 0) {
    switchChannel(remaining[0]);
  }
}

function handleIncoming(raw: string): void {
  const lines = raw.split('\r\n').filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('PING')) {
      const kbve = (window as any).kbve;
      if (kbve?.ws) {
        kbve.ws.send(encoder.encode(`PONG ${line.slice(5)}\r\n`));
      }
      continue;
    }

    const parsed = parseIrcLine(line);
    if (!parsed) continue;

    switch (parsed.command) {
      case 'PRIVMSG': {
        const channel = parsed.params[0];
        const content = parsed.trailing ?? '';
        pushMessage({
          id: makeId(),
          nick: parsed.nick,
          content,
          channel,
          timestamp: Date.now(),
          type: 'message',
        });
        break;
      }

      case 'JOIN': {
        const channel = parsed.params[0] || parsed.trailing || '';
        const channels = new Map($channels.get());
        const ch = channels.get(channel);
        if (ch && !ch.users.includes(parsed.nick)) {
          channels.set(channel, { ...ch, users: [...ch.users, parsed.nick] });
          $channels.set(channels);
        }
        pushMessage({
          id: makeId(),
          nick: parsed.nick,
          content: `${parsed.nick} joined ${channel}`,
          channel,
          timestamp: Date.now(),
          type: 'join',
        });
        break;
      }

      case 'PART': {
        const channel = parsed.params[0];
        const channels = new Map($channels.get());
        const ch = channels.get(channel);
        if (ch) {
          channels.set(channel, {
            ...ch,
            users: ch.users.filter((u) => u !== parsed.nick),
          });
          $channels.set(channels);
        }
        pushMessage({
          id: makeId(),
          nick: parsed.nick,
          content: `${parsed.nick} left ${channel}`,
          channel,
          timestamp: Date.now(),
          type: 'part',
        });
        break;
      }

      case '332': {
        const channel = parsed.params[1];
        const topic = parsed.trailing ?? '';
        const channels = new Map($channels.get());
        const ch = channels.get(channel);
        if (ch) {
          channels.set(channel, { ...ch, topic });
          $channels.set(channels);
        }
        break;
      }

      case '353': {
        const channel = parsed.params[2];
        const nicks = (parsed.trailing ?? '').split(' ').filter(Boolean);
        const channels = new Map($channels.get());
        const ch = channels.get(channel);
        if (ch) {
          const uniqueUsers = Array.from(new Set([...ch.users, ...nicks]));
          channels.set(channel, { ...ch, users: uniqueUsers });
          $channels.set(channels);
        }
        break;
      }

      case '001': {
        if (parsed.params[0]) {
          $nick.set(parsed.params[0]);
        }
        systemMessage(
          $activeChannel.get(),
          parsed.trailing ?? 'Welcome to IRC',
        );
        break;
      }

      default:
        break;
    }
  }
}

interface ParsedIrcMessage {
  nick: string;
  command: string;
  params: string[];
  trailing?: string;
}

function parseIrcLine(line: string): ParsedIrcMessage | null {
  let nick = '';
  let rest = line;

  if (rest.startsWith(':')) {
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) return null;
    const prefix = rest.slice(1, spaceIdx);
    nick = prefix.split('!')[0];
    rest = rest.slice(spaceIdx + 1);
  }

  let trailing: string | undefined;
  const trailIdx = rest.indexOf(' :');
  if (trailIdx !== -1) {
    trailing = rest.slice(trailIdx + 2);
    rest = rest.slice(0, trailIdx);
  }

  const parts = rest.split(' ').filter(Boolean);
  if (parts.length === 0) return null;

  const command = parts[0];
  const params = parts.slice(1);

  return { nick, command, params, trailing };
}
