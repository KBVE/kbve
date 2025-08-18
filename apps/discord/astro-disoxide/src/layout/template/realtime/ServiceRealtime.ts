import { atom } from 'nanostores';
import { supabase } from '../supabase';
import { eventBus } from '../eventBus';
import type { RealtimeChannel, RealtimeChannelSendResponse } from '@supabase/supabase-js';

interface RealtimeMessage {
  id?: number;
  topic: string;
  user_id?: string;
  payload: any;
  message_type?: 'broadcast' | 'presence' | 'postgres_changes' | 'system';
  created_at?: string;
  updated_at?: string;
}

interface ChannelSubscription {
  channel: RealtimeChannel;
  topic: string;
  callbacks: {
    onMessage?: (payload: any) => void;
    onPresence?: (payload: any) => void;
    onJoin?: (payload: any) => void;
    onLeave?: (payload: any) => void;
  };
}

class RealtimeService {
  private static instance: RealtimeService;
  private static initialized: boolean = false;
  
  // State atoms
  public readonly loadingAtom = atom<boolean>(false);
  public readonly errorAtom = atom<string>("");
  public readonly successAtom = atom<string>("");
  public readonly connectedAtom = atom<boolean>(false);
  public readonly activeChannelsAtom = atom<string[]>([]);
  
  private subscriptions: Map<string, ChannelSubscription> = new Map();

  private constructor() {}

  public static async getInstance(): Promise<RealtimeService> {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    
    // Initialize auth if not already done
    if (!RealtimeService.initialized) {
      try {
        await RealtimeService.instance.initializeAuth();
        RealtimeService.initialized = true;
      } catch (err) {
        console.error('[RealtimeService] Failed to initialize auth during getInstance:', err);
        // Don't throw here, let individual methods handle auth failures
      }
    }
    
    return RealtimeService.instance;
  }

  private clearMessages(): void {
    this.errorAtom.set("");
    this.successAtom.set("");
  }

  public async initializeAuth(): Promise<void> {
    try {
      // For realtime connections, we typically use the anon key
      // The user context is handled by the session, not the JWT token
      console.log('[RealtimeService] Initializing realtime auth...');
      
      // Just set auth without token to use the default client configuration
      await supabase.realtime.setAuth();
      
      console.log('[RealtimeService] Authentication initialized with default config');
    } catch (err: any) {
      console.error('[RealtimeService] Failed to initialize auth:', err);
      this.errorAtom.set(`Auth initialization failed: ${err.message}`);
      throw err;
    }
  }

  public async subscribeToChannel(
    topic: string,
    callbacks: {
      onMessage?: (payload: any) => void;
      onPresence?: (payload: any) => void;
      onJoin?: (payload: any) => void;
      onLeave?: (payload: any) => void;
    } = {}
  ): Promise<RealtimeChannel | null> {
    this.clearMessages();
    this.loadingAtom.set(true);

    try {
      // Check if already subscribed to this topic
      if (this.subscriptions.has(topic)) {
        this.errorAtom.set(`Already subscribed to channel: ${topic}`);
        return null;
      }

      // Create channel subscription
      const channel = supabase
        .channel(topic)
        .on('broadcast', { event: 'message' }, (payload) => {
          console.log(`[RealtimeService] Message received on ${topic}:`, payload);
          eventBus.messageReceived(topic, payload);
          callbacks.onMessage?.(payload);
        })
        .on('presence', { event: 'sync' }, () => {
          console.log(`[RealtimeService] Presence sync on ${topic}`);
          const state = channel.presenceState();
          eventBus.presenceUpdated(topic, state);
          callbacks.onPresence?.(state);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log(`[RealtimeService] User joined ${topic}:`, key, newPresences);
          eventBus.userJoined(topic, key, newPresences);
          callbacks.onJoin?.({ key, newPresences });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log(`[RealtimeService] User left ${topic}:`, key, leftPresences);
          eventBus.userLeft(topic, key, leftPresences);
          callbacks.onLeave?.({ key, leftPresences });
        })
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'realtime_messages',
            filter: `topic=eq.${topic}`
          }, 
          (payload) => {
            console.log(`[RealtimeService] Database change on ${topic}:`, payload);
            eventBus.messageReceived(topic, payload);
            callbacks.onMessage?.(payload);
          }
        );

      // Subscribe to the channel
      channel.subscribe((status) => {
        console.log(`[RealtimeService] Channel ${topic} status:`, status);
        
        if (status === 'SUBSCRIBED') {
          this.connectedAtom.set(true);
          this.successAtom.set(`Connected to channel: ${topic}`);
          
          // Update active channels list
          const current = this.activeChannelsAtom.get();
          this.activeChannelsAtom.set([...current, topic]);
          
          // Emit eventBus event
          eventBus.channelConnected(topic);
        } else if (status === 'CHANNEL_ERROR') {
          this.errorAtom.set(`Failed to connect to channel: ${topic}`);
          this.connectedAtom.set(false);
          eventBus.connectionError(topic, 'Channel connection error');
        } else if (status === 'TIMED_OUT') {
          this.errorAtom.set(`Connection to channel ${topic} timed out`);
          this.connectedAtom.set(false);
          eventBus.connectionError(topic, 'Connection timed out');
        }
      });

      // Store subscription info
      this.subscriptions.set(topic, {
        channel,
        topic,
        callbacks
      });

      return channel;

    } catch (err: any) {
      this.errorAtom.set(err.message || `Failed to subscribe to channel: ${topic}`);
      this.connectedAtom.set(false);
      return null;
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public async unsubscribeFromChannel(topic: string): Promise<void> {
    this.clearMessages();
    this.loadingAtom.set(true);

    try {
      const subscription = this.subscriptions.get(topic);
      
      if (!subscription) {
        this.errorAtom.set(`Not subscribed to channel: ${topic}`);
        return;
      }

      await subscription.channel.unsubscribe();
      this.subscriptions.delete(topic);
      
      // Update active channels list
      const current = this.activeChannelsAtom.get();
      this.activeChannelsAtom.set(current.filter(ch => ch !== topic));
      
      this.successAtom.set(`Unsubscribed from channel: ${topic}`);
      
      // Emit eventBus event
      eventBus.channelDisconnected(topic, 'user-requested');
      
      // Check if any channels are still connected
      if (this.subscriptions.size === 0) {
        this.connectedAtom.set(false);
      }

    } catch (err: any) {
      this.errorAtom.set(err.message || `Failed to unsubscribe from channel: ${topic}`);
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public async sendMessage(topic: string, payload: any): Promise<RealtimeChannelSendResponse | null> {
    this.clearMessages();

    try {
      const subscription = this.subscriptions.get(topic);
      
      if (!subscription) {
        this.errorAtom.set(`Not subscribed to channel: ${topic}. Subscribe first.`);
        return null;
      }

      const response = await subscription.channel.send({
        type: 'broadcast',
        event: 'message',
        payload
      });

      if (response === 'ok') {
        this.successAtom.set(`Message sent to ${topic}`);
        eventBus.messageSent(topic, payload, response);
      } else {
        this.errorAtom.set(`Failed to send message to ${topic}: ${response}`);
      }

      return response;

    } catch (err: any) {
      this.errorAtom.set(err.message || `Failed to send message to ${topic}`);
      return null;
    }
  }

  public async updatePresence(topic: string, presenceData: any): Promise<RealtimeChannelSendResponse | null> {
    this.clearMessages();

    try {
      const subscription = this.subscriptions.get(topic);
      
      if (!subscription) {
        this.errorAtom.set(`Not subscribed to channel: ${topic}. Subscribe first.`);
        return null;
      }

      const response = await subscription.channel.track(presenceData);

      if (response === 'ok') {
        this.successAtom.set(`Presence updated for ${topic}`);
        eventBus.presenceUpdated(topic, presenceData);
      } else {
        this.errorAtom.set(`Failed to update presence for ${topic}: ${response}`);
      }

      return response;

    } catch (err: any) {
      this.errorAtom.set(err.message || `Failed to update presence for ${topic}`);
      return null;
    }
  }

  public async insertMessage(message: Omit<RealtimeMessage, 'id' | 'created_at' | 'updated_at'>): Promise<RealtimeMessage | null> {
    this.clearMessages();
    this.loadingAtom.set(true);

    try {
      const { data, error } = await supabase
        .from('realtime_messages')
        .insert([message])
        .select()
        .single();

      if (error) throw error;

      this.successAtom.set(`Message inserted to topic: ${message.topic}`);
      return data as RealtimeMessage;

    } catch (err: any) {
      this.errorAtom.set(err.message || 'Failed to insert message');
      return null;
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public async getMessages(topic: string, limit: number = 50): Promise<RealtimeMessage[]> {
    this.clearMessages();
    this.loadingAtom.set(true);

    try {
      const { data, error } = await supabase
        .from('realtime_messages')
        .select('*')
        .eq('topic', topic)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      this.successAtom.set(`Retrieved ${data?.length || 0} messages from ${topic}`);
      return data as RealtimeMessage[] || [];

    } catch (err: any) {
      this.errorAtom.set(err.message || `Failed to get messages from ${topic}`);
      return [];
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public getActiveChannels(): string[] {
    return this.activeChannelsAtom.get();
  }

  public isConnected(): boolean {
    return this.connectedAtom.get();
  }

  public getChannelCount(): number {
    return this.subscriptions.size;
  }

  public async disconnectAll(): Promise<void> {
    this.clearMessages();
    this.loadingAtom.set(true);

    try {
      const topics = Array.from(this.subscriptions.keys());
      const channelCount = topics.length;
      
      for (const topic of topics) {
        await this.unsubscribeFromChannel(topic);
      }
      
      this.subscriptions.clear();
      this.activeChannelsAtom.set([]);
      this.connectedAtom.set(false);
      this.successAtom.set('Disconnected from all channels');
      
      // Emit eventBus event
      eventBus.allDisconnected(channelCount);

    } catch (err: any) {
      this.errorAtom.set(err.message || 'Failed to disconnect from all channels');
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public clearState(): void {
    this.clearMessages();
    this.loadingAtom.set(false);
    this.connectedAtom.set(false);
    this.activeChannelsAtom.set([]);
  }
}

// Export singleton instance getter (async)
export const getRealtimeService = () => RealtimeService.getInstance();

// For backwards compatibility, create a synchronous version that logs a warning
let _cachedInstance: RealtimeService | null = null;
export const realtimeService = {
  async getService(): Promise<RealtimeService> {
    if (!_cachedInstance) {
      _cachedInstance = await RealtimeService.getInstance();
    }
    return _cachedInstance;
  }
};