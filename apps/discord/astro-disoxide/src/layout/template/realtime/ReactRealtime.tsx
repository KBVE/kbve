/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { realtimeService } from './ServiceRealtime';
import { useEventBus } from '../eventBus';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};


interface RealtimeChannelProps {
  topic: string;
  title?: string;
  onMessage?: (payload: any) => void;
  onPresence?: (payload: any) => void;
  onJoin?: (payload: any) => void;
  onLeave?: (payload: any) => void;
}

export const RealtimeChannel: React.FC<RealtimeChannelProps> = ({
  topic,
  title,
  onMessage,
  onPresence,
  onJoin,
  onLeave
}) => {
  const loading = useStore(realtimeService.loadingAtom);
  const activeChannels = useStore(realtimeService.activeChannelsAtom);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const isActiveChannel = useMemo(() => {
    return activeChannels.includes(topic);
  }, [activeChannels, topic]);

  useEffect(() => {
    setIsSubscribed(isActiveChannel);
  }, [isActiveChannel]);

  const handleSubscribe = useCallback(async () => {
    const channel = await realtimeService.subscribeToChannel(topic, {
      onMessage,
      onPresence,
      onJoin,
      onLeave
    });
    
    if (channel) {
      setIsSubscribed(true);
    }
  }, [topic, onMessage, onPresence, onJoin, onLeave]);

  const handleUnsubscribe = useCallback(async () => {
    await realtimeService.unsubscribeFromChannel(topic);
    setIsSubscribed(false);
  }, [topic]);

  return (
    <div className="relative group">
      <button
        onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
        disabled={loading}
        className={cn(
          "group relative overflow-hidden",
          "flex items-center justify-center gap-3 w-full py-2.5 px-5 min-h-[42px] rounded-xl font-medium transition-all ease-out duration-300",
          isSubscribed ? (
            "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
          ) : (
            "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
          ),
          "hover:ring-2 hover:ring-offset-2 hover:ring-cyan-500",
          loading && "opacity-50 cursor-not-allowed"
        )}
        type="button"
      >
        <span className="absolute right-0 w-8 h-32 -mt-12 bg-white/30 opacity-10 rotate-12 translate-x-12 group-hover:-translate-x-40 transition-all duration-1000 ease-out pointer-events-none"></span>
        
        {loading ? (
          <div className="relative flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span className="text-sm font-medium leading-relaxed">
              {isSubscribed ? 'Disconnecting...' : 'Connecting...'}
            </span>
          </div>
        ) : (
          <div className="relative flex items-center justify-center gap-3">
            {isSubscribed ? (
              <>
                <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span className="text-sm font-medium leading-relaxed">
                  Connected to {title || topic}
                </span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <span className="text-sm font-medium leading-relaxed">
                  Connect to {title || topic}
                </span>
              </>
            )}
          </div>
        )}
      </button>
    </div>
  );
};

interface RealtimeMessengerProps {
  topic: string;
  title?: string;
  placeholder?: string;
  maxMessages?: number;
}

export const RealtimeMessenger: React.FC<RealtimeMessengerProps> = ({
  topic,
  title,
  placeholder = "Type your message...",
  maxMessages = 50
}) => {
  const loading = useStore(realtimeService.loadingAtom);
  const error = useStore(realtimeService.errorAtom);
  const success = useStore(realtimeService.successAtom);
  const activeChannels = useStore(realtimeService.activeChannelsAtom);
  const eventBus = useEventBus();
  
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isSubscribed = useMemo(() => {
    return activeChannels.includes(topic);
  }, [activeChannels, topic]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Listen to eventBus for global realtime events
  useEffect(() => {
    const unsubscribeConnected = eventBus.on('realtime:channel-connected', (data) => {
      if (data.topic === topic) {
        setConnectionStatus('connected');
      }
    });

    const unsubscribeDisconnected = eventBus.on('realtime:channel-disconnected', (data) => {
      if (data.topic === topic) {
        setConnectionStatus('disconnected');
      }
    });

    const unsubscribeMessageReceived = eventBus.on('realtime:message-received', (data) => {
      if (data.topic === topic) {
        setMessages(prev => [...prev.slice(-(maxMessages - 1)), {
          payload: data.payload,
          event: 'message',
          timestamp: data.timestamp
        }]);
      }
    });

    const unsubscribeMessageSent = eventBus.on('realtime:message-sent', (data) => {
      if (data.topic === topic) {
        // Message was already added optimistically, but we can update status
        console.log(`Message sent successfully to ${data.topic}:`, data.payload);
      }
    });

    const unsubscribeConnectionError = eventBus.on('realtime:connection-error', (data) => {
      if (data.topic === topic) {
        setConnectionStatus('error');
      }
    });

    // Cleanup function
    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeMessageReceived();
      unsubscribeMessageSent();
      unsubscribeConnectionError();
    };
  }, [topic, maxMessages, eventBus]);

  const handleMessage = useCallback((payload: any) => {
    setMessages(prev => [...prev.slice(-(maxMessages - 1)), payload]);
  }, [maxMessages]);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || !isSubscribed) return;

    const messagePayload = {
      text: message.trim(),
      timestamp: new Date().toISOString(),
      user: 'Anonymous' // This could be enhanced with actual user data
    };

    const response = await realtimeService.sendMessage(topic, messagePayload);
    
    if (response === 'ok') {
      setMessage('');
      // Add to local messages immediately for better UX
      setMessages(prev => [...prev.slice(-(maxMessages - 1)), {
        payload: messagePayload,
        event: 'message'
      }]);
    }
  }, [message, topic, isSubscribed, maxMessages]);

  const handleSubscribe = useCallback(async () => {
    await realtimeService.subscribeToChannel(topic, {
      onMessage: handleMessage
    });
  }, [topic, handleMessage]);

  const loadHistory = useCallback(async () => {
    const history = await realtimeService.getMessages(topic, maxMessages);
    setMessages(history.map(msg => ({
      payload: msg.payload,
      event: 'message',
      created_at: msg.created_at
    })));
  }, [topic, maxMessages]);

  useEffect(() => {
    if (isSubscribed) {
      loadHistory();
    } else {
      setMessages([]);
    }
  }, [isSubscribed, loadHistory]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold mb-2 leading-relaxed text-[var(--sl-color-white)]">
          {title || `Realtime Chat: ${topic}`}
        </h3>
        <div className="flex items-center justify-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            connectionStatus === 'connected' ? "bg-green-500 animate-pulse" : 
            connectionStatus === 'error' ? "bg-red-500" : "bg-gray-500"
          )}></div>
          <span className="text-sm text-[var(--sl-color-gray-3)]">
            {connectionStatus === 'connected' ? 'Connected' : 
             connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-center text-sm font-medium mb-4 border leading-relaxed bg-red-600/20 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg text-center text-sm font-medium mb-4 border leading-relaxed bg-green-600/20 border-green-500/30 text-green-400">
          {success}
        </div>
      )}

      {!isSubscribed && (
        <div className="mb-4">
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className={cn(
              "w-full py-2.5 px-5 rounded-xl font-medium transition-all ease-out duration-300",
              "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white",
              "hover:ring-2 hover:ring-offset-2 hover:ring-cyan-500",
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? 'Connecting...' : 'Join Channel'}
          </button>
        </div>
      )}

      {isSubscribed && (
        <>
          <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-4 h-64 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 text-sm">
                No messages yet. Start the conversation!
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg, index) => (
                  <div key={index} className="text-sm">
                    <span className="text-blue-400 font-medium">
                      {msg.payload?.user || 'Anonymous'}:
                    </span>
                    <span className="text-gray-300 ml-2">
                      {msg.payload?.text || JSON.stringify(msg.payload)}
                    </span>
                    {msg.payload?.timestamp && (
                      <span className="text-gray-500 text-xs ml-2">
                        {new Date(msg.payload.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={placeholder}
              disabled={loading || !isSubscribed}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-lg border transition-colors",
                "bg-gray-800 border-gray-700 text-white placeholder-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                loading && "opacity-50 cursor-not-allowed"
              )}
            />
            <button
              type="submit"
              disabled={loading || !message.trim() || !isSubscribed}
              className={cn(
                "px-6 py-2.5 rounded-lg font-medium transition-all ease-out duration-300",
                "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white",
                "hover:ring-2 hover:ring-offset-2 hover:ring-blue-500",
                (loading || !message.trim() || !isSubscribed) && "opacity-50 cursor-not-allowed"
              )}
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export const ReactRealtime: React.FC<{
  topic?: string;
  showChannel?: boolean;
  showMessenger?: boolean;
  title?: string;
  description?: string;
  channelTitle?: string;
  messengerTitle?: string;
}> = ({
  topic = 'general',
  showChannel = true,
  showMessenger = true,
  title = "Realtime Communication",
  description = "Connect and communicate in real-time",
  channelTitle,
  messengerTitle
}) => {
  const error = useStore(realtimeService.errorAtom);
  const success = useStore(realtimeService.successAtom);
  const activeChannels = useStore(realtimeService.activeChannelsAtom);
  const eventBus = useEventBus();
  
  const [globalEvents, setGlobalEvents] = useState<string[]>([]);

  // Listen to global realtime events for debugging/monitoring
  useEffect(() => {
    const unsubscribeAllDisconnected = eventBus.on('realtime:all-disconnected', (data) => {
      setGlobalEvents(prev => [...prev.slice(-4), `All ${data.channelCount} channels disconnected`]);
    });

    const unsubscribeChannelConnected = eventBus.on('realtime:channel-connected', (data) => {
      setGlobalEvents(prev => [...prev.slice(-4), `Connected to ${data.topic}`]);
    });

    const unsubscribeChannelDisconnected = eventBus.on('realtime:channel-disconnected', (data) => {
      setGlobalEvents(prev => [...prev.slice(-4), `Disconnected from ${data.topic}`]);
    });

    return () => {
      unsubscribeAllDisconnected();
      unsubscribeChannelConnected();
      unsubscribeChannelDisconnected();
    };
  }, [eventBus]);

  const handleDisconnectAll = useCallback(async () => {
    await realtimeService.disconnectAll();
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold mb-2 leading-relaxed text-[var(--sl-color-white)]">{title}</h2>
        <p className="text-sm leading-relaxed text-[var(--sl-color-gray-3)]">{description}</p>
      </div>

      {activeChannels.length > 0 && (
        <div className="text-center">
          <div className="text-sm text-[var(--sl-color-gray-3)] mb-2">
            Active channels: {activeChannels.join(', ')}
          </div>
          <button
            onClick={handleDisconnectAll}
            className="text-sm text-red-400 hover:text-red-300 transition-colors underline"
          >
            Disconnect from all channels
          </button>
        </div>
      )}

      {globalEvents.length > 0 && (
        <div className="text-center">
          <div className="text-xs text-[var(--sl-color-gray-4)] mb-2">Recent Events:</div>
          <div className="space-y-1">
            {globalEvents.map((event, index) => (
              <div key={index} className="text-xs text-[var(--sl-color-gray-3)]">
                {event}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg text-center text-sm font-medium border leading-relaxed bg-red-600/20 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg text-center text-sm font-medium border leading-relaxed bg-green-600/20 border-green-500/30 text-green-400">
          {success}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        {showChannel && (
          <div>
            <h3 className="text-md font-medium mb-3 text-[var(--sl-color-white)]">Channel Control</h3>
            <RealtimeChannel 
              topic={topic} 
              title={channelTitle} 
            />
          </div>
        )}

        {showMessenger && (
          <div className="lg:col-span-2">
            <RealtimeMessenger 
              topic={topic} 
              title={messengerTitle}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export { realtimeService };

export const subscribeToChannel = (topic: string, callbacks?: any) => 
  realtimeService.subscribeToChannel(topic, callbacks);
export const unsubscribeFromChannel = (topic: string) => 
  realtimeService.unsubscribeFromChannel(topic);
export const sendMessage = (topic: string, payload: any) => 
  realtimeService.sendMessage(topic, payload);
