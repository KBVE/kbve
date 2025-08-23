using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using R3;
using Supabase.Realtime;
using Supabase.Realtime.Interfaces;
using Supabase.Realtime.Models;
using VContainer;
using VContainer.Unity;
using UnityEngine;
using KBVE.SSDB;
using KBVE.MMExtensions.Orchestrator;
using Newtonsoft.Json;

namespace KBVE.SSDB.SupabaseFDW
{
    public class SupabaseRealtimeFDW : IInitializable, IDisposable
    {
        private readonly ISupabaseInstance _supabaseInstance;
        private readonly CompositeDisposable _disposables = new();
        private readonly Dictionary<string, RealtimeChannel> _channels = new();
        
        public ReactiveProperty<bool> IsConnected { get; } = new(false);
        public ReactiveProperty<string> ConnectionState { get; } = new("disconnected");
        public ReactiveProperty<string> LastError { get; } = new(string.Empty);
        
        private readonly Subject<RealtimeMessage> _messageSubject = new();
        public Observable<RealtimeMessage> MessageStream => _messageSubject;
        
        [Inject]
        public SupabaseRealtimeFDW(ISupabaseInstance supabaseInstance)
        {
            _supabaseInstance = supabaseInstance;
        }
        
        public void Initialize()
        {
            _supabaseInstance.Initialized
                .Where(initialized => initialized)
                .Subscribe(async _ =>
                {
                    await ConnectRealtimeAsync();
                })
                .AddTo(_disposables);
                
            _supabaseInstance.CurrentSession
                .Subscribe(session =>
                {
                    if (session == null)
                    {
                        DisconnectAllChannels();
                    }
                })
                .AddTo(_disposables);
        }
        
        private async UniTask ConnectRealtimeAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                if (!_supabaseInstance.Initialized.Value || !_supabaseInstance.Online.Value)
                {
                    Operator.D("Cannot connect realtime - Supabase not initialized or offline");
                    return;
                }
                
                var realtime = _supabaseInstance.Client.Realtime;
                
                realtime.OnOpen += OnRealtimeOpen;
                realtime.OnClose += OnRealtimeClose;
                realtime.OnError += OnRealtimeError;
                
                await realtime.ConnectAsync();
                
                IsConnected.Value = true;
                ConnectionState.Value = "connected";
                Operator.D("Realtime connected successfully");
            }
            catch (Exception ex)
            {
                LastError.Value = ex.Message;
                ConnectionState.Value = "error";
                Operator.D($"Failed to connect realtime: {ex.Message}");
            }
        }
        
        public async UniTask<RealtimeChannel> SubscribeToChannelAsync(
            string channelName,
            CancellationToken cancellationToken = default)
        {
            try
            {
                if (_channels.ContainsKey(channelName))
                {
                    Operator.D($"Already subscribed to channel: {channelName}");
                    return _channels[channelName];
                }
                
                if (!IsConnected.Value)
                {
                    await ConnectRealtimeAsync(cancellationToken);
                }
                
                var channel = _supabaseInstance.Client.Realtime.Channel(channelName);
                
                channel.OnMessage += (sender, message) => HandleChannelMessage(channelName, message);
                channel.OnError += (sender, error) => HandleChannelError(channelName, error);
                channel.OnClose += (sender) => HandleChannelClose(channelName);
                
                await channel.Subscribe();
                
                _channels[channelName] = channel;
                Operator.D($"Subscribed to channel: {channelName}");
                
                return channel;
            }
            catch (Exception ex)
            {
                LastError.Value = ex.Message;
                Operator.D($"Failed to subscribe to channel {channelName}: {ex.Message}");
                throw;
            }
        }
        
        public async UniTask<bool> UnsubscribeFromChannelAsync(
            string channelName,
            CancellationToken cancellationToken = default)
        {
            try
            {
                if (!_channels.ContainsKey(channelName))
                {
                    Operator.D($"Not subscribed to channel: {channelName}");
                    return false;
                }
                
                var channel = _channels[channelName];
                await channel.Unsubscribe();
                
                _channels.Remove(channelName);
                Operator.D($"Unsubscribed from channel: {channelName}");
                
                return true;
            }
            catch (Exception ex)
            {
                LastError.Value = ex.Message;
                Operator.D($"Failed to unsubscribe from channel {channelName}: {ex.Message}");
                return false;
            }
        }
        
        public async UniTask BroadcastAsync(
            string channelName,
            string eventName,
            object payload,
            CancellationToken cancellationToken = default)
        {
            try
            {
                if (!_channels.ContainsKey(channelName))
                {
                    await SubscribeToChannelAsync(channelName, cancellationToken);
                }
                
                var channel = _channels[channelName];
                await channel.Send(eventName, payload);
                
                Operator.D($"Broadcast sent to {channelName}: {eventName}");
            }
            catch (Exception ex)
            {
                LastError.Value = ex.Message;
                Operator.D($"Failed to broadcast to {channelName}: {ex.Message}");
                throw;
            }
        }
        
        public async UniTask<RealtimeChannel> SubscribeToTableChangesAsync<T>(
            string tableName,
            Action<T, string> onInsert = null,
            Action<T, T, string> onUpdate = null,
            Action<T, string> onDelete = null,
            CancellationToken cancellationToken = default) where T : class
        {
            try
            {
                var channelName = $"table-{tableName}";
                
                if (_channels.ContainsKey(channelName))
                {
                    Operator.D($"Already subscribed to table: {tableName}");
                    return _channels[channelName];
                }
                
                var channel = await SubscribeToChannelAsync(channelName, cancellationToken);
                
                channel.OnPostgresChange += (sender, change) =>
                {
                    Operator.D($"Postgres change received for {tableName}: {change.EventType}");
                    
                    switch (change.EventType)
                    {
                        case "INSERT":
                            if (onInsert != null && change.Record != null)
                            {
                                var record = JsonConvert.DeserializeObject<T>(change.Record.ToString());
                                onInsert(record, change.Table);
                            }
                            break;
                            
                        case "UPDATE":
                            if (onUpdate != null && change.Record != null && change.OldRecord != null)
                            {
                                var newRecord = JsonConvert.DeserializeObject<T>(change.Record.ToString());
                                var oldRecord = JsonConvert.DeserializeObject<T>(change.OldRecord.ToString());
                                onUpdate(newRecord, oldRecord, change.Table);
                            }
                            break;
                            
                        case "DELETE":
                            if (onDelete != null && change.OldRecord != null)
                            {
                                var record = JsonConvert.DeserializeObject<T>(change.OldRecord.ToString());
                                onDelete(record, change.Table);
                            }
                            break;
                    }
                };
                
                Operator.D($"Subscribed to table changes: {tableName}");
                return channel;
            }
            catch (Exception ex)
            {
                LastError.Value = ex.Message;
                Operator.D($"Failed to subscribe to table {tableName}: {ex.Message}");
                throw;
            }
        }
        
        public async UniTask<RealtimeChannel> SubscribeToPresenceAsync(
            string channelName,
            Action<Dictionary<string, object>> onSync = null,
            Action<Dictionary<string, object>> onJoin = null,
            Action<Dictionary<string, object>> onLeave = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var presenceChannelName = $"presence-{channelName}";
                var channel = await SubscribeToChannelAsync(presenceChannelName, cancellationToken);
                
                var presence = channel.Register();
                
                if (onSync != null)
                    presence.OnSync += () => onSync(presence.State);
                    
                if (onJoin != null)
                    presence.OnJoin += (key, current, left) => onJoin(current);
                    
                if (onLeave != null)
                    presence.OnLeave += (key, current, left) => onLeave(left);
                
                await presence.Track(new Dictionary<string, object>
                {
                    { "user_id", _supabaseInstance.CurrentUser.Value?.Id ?? "anonymous" },
                    { "online_at", DateTime.UtcNow.ToString("O") }
                });
                
                Operator.D($"Subscribed to presence: {channelName}");
                return channel;
            }
            catch (Exception ex)
            {
                LastError.Value = ex.Message;
                Operator.D($"Failed to subscribe to presence {channelName}: {ex.Message}");
                throw;
            }
        }
        
        private void HandleChannelMessage(string channelName, object message)
        {
            Operator.D($"Message received on {channelName}");
            _messageSubject.OnNext(new RealtimeMessage
            {
                Channel = channelName,
                Payload = message,
                Timestamp = DateTime.UtcNow
            });
        }
        
        private void HandleChannelError(string channelName, Exception error)
        {
            LastError.Value = $"{channelName}: {error.Message}";
            Operator.D($"Channel error on {channelName}: {error.Message}");
        }
        
        private void HandleChannelClose(string channelName)
        {
            Operator.D($"Channel closed: {channelName}");
            _channels.Remove(channelName);
        }
        
        private void OnRealtimeOpen(object sender, EventArgs e)
        {
            IsConnected.Value = true;
            ConnectionState.Value = "connected";
            Operator.D("Realtime connection opened");
        }
        
        private void OnRealtimeClose(object sender, EventArgs e)
        {
            IsConnected.Value = false;
            ConnectionState.Value = "disconnected";
            Operator.D("Realtime connection closed");
        }
        
        private void OnRealtimeError(object sender, Exception e)
        {
            LastError.Value = e.Message;
            ConnectionState.Value = "error";
            Operator.D($"Realtime error: {e.Message}");
        }
        
        private void DisconnectAllChannels()
        {
            foreach (var channel in _channels.Values)
            {
                try
                {
                    channel.Unsubscribe().GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    Operator.D($"Error unsubscribing channel: {ex.Message}");
                }
            }
            
            _channels.Clear();
            IsConnected.Value = false;
            ConnectionState.Value = "disconnected";
            Operator.D("All channels disconnected");
        }
        
        public void Dispose()
        {
            DisconnectAllChannels();
            
            if (_supabaseInstance.Client?.Realtime != null)
            {
                var realtime = _supabaseInstance.Client.Realtime;
                realtime.OnOpen -= OnRealtimeOpen;
                realtime.OnClose -= OnRealtimeClose;
                realtime.OnError -= OnRealtimeError;
                
                realtime.Disconnect();
            }
            
            _messageSubject.OnCompleted();
            _messageSubject.Dispose();
            _disposables?.Dispose();
        }
    }
    
    public class RealtimeMessage
    {
        public string Channel { get; set; }
        public object Payload { get; set; }
        public DateTime Timestamp { get; set; }
    }
}