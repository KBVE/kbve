using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using R3;
using Supabase.Realtime;
using Supabase.Realtime.Channel;
using Supabase.Realtime.Models;
using VContainer;
using VContainer.Unity;
using UnityEngine;
using KBVE.SSDB;
using KBVE.MMExtensions.Orchestrator;

namespace KBVE.SSDB.SupabaseFDW
{
    public class SupabaseRealtimeFDW : IAsyncStartable, IDisposable
    {
        private readonly ISupabaseInstance _supabaseInstance;
        private readonly CompositeDisposable _disposables = new();
        private readonly CancellationTokenSource _lifetimeCts = new();
        private readonly Dictionary<string, RealtimeChannel> _channels = new();
        private readonly SemaphoreSlim _channelLock = new(1, 1);
        
        public ReactiveProperty<bool> IsConnected { get; } = new(false);
        public ReactiveProperty<string> ConnectionState { get; } = new("disconnected");
        public ReactiveProperty<string> ErrorMessage { get; } = new(string.Empty);
        
        [Inject]
        public SupabaseRealtimeFDW(ISupabaseInstance supabaseInstance)
        {
            _supabaseInstance = supabaseInstance;
        }
        
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            // Create a linked token that will cancel if either the lifetime or external token cancels
            var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _lifetimeCts.Token);
            
            try
            {
                // Monitor connection state changes
                _supabaseInstance.RealtimeConnected
                    .Subscribe(connected =>
                    {
                        IsConnected.Value = connected;
                        ConnectionState.Value = connected ? "connected" : "disconnected";
                        Operator.D($"Realtime connection state: {ConnectionState.Value}");
                    })
                    .AddTo(_disposables);
                
                // Initialize realtime connection if client is ready
                if (_supabaseInstance.Initialized.Value)
                {
                    await InitializeRealtimeAsync(linkedCts.Token);
                }
                else
                {
                    // Wait for initialization then connect
                    _supabaseInstance.Initialized
                        .Where(initialized => initialized)
                        .Take(1) // Only react to the first initialization
                        .Subscribe(async _ =>
                        {
                            await InitializeRealtimeAsync(linkedCts.Token);
                        })
                        .AddTo(_disposables);
                }
            }
            finally
            {
                linkedCts?.Dispose();
            }
        }
        
        private async UniTask InitializeRealtimeAsync(CancellationToken cancellationToken)
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                
                if (_supabaseInstance.Client?.Realtime != null)
                {
                    await _supabaseInstance.Client.Realtime.ConnectAsync();
                    Operator.D("Realtime connection initialized");
                }
            }
            catch (OperationCanceledException)
            {
                ErrorMessage.Value = "Realtime initialization cancelled";
                Operator.D("Realtime initialization cancelled");
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = $"Failed to initialize realtime: {ex.Message}";
                Operator.D($"Realtime initialization failed: {ex.Message}");
            }
        }
        
        public async UniTask<RealtimeChannel> SubscribeToChannelAsync(
            string channelName, 
            RealtimeChannel.Options options = null,
            CancellationToken cancellationToken = default)
        {
            // Create combined token that respects both lifetime and passed token
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            await _channelLock.WaitAsync(effectiveToken);
            try
            {
                if (!_supabaseInstance.Initialized.Value)
                {
                    ErrorMessage.Value = "Supabase client not initialized";
                    return null;
                }
                
                effectiveToken.ThrowIfCancellationRequested();
                
                // Check if channel already exists
                if (_channels.TryGetValue(channelName, out var existingChannel))
                {
                    Operator.D($"Channel {channelName} already subscribed");
                    return existingChannel;
                }
                
                // Create and subscribe to channel
                var channel = _supabaseInstance.Client.Realtime.Channel(channelName, options);
                await channel.Subscribe();
                
                _channels[channelName] = channel;
                Operator.D($"Subscribed to channel: {channelName}");
                
                return channel;
            }
            catch (OperationCanceledException)
            {
                ErrorMessage.Value = "Channel subscription cancelled";
                Operator.D($"Channel subscription cancelled: {channelName}");
                return null;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = $"Failed to subscribe to channel: {ex.Message}";
                Operator.D($"Channel subscription failed: {ex.Message}");
                return null;
            }
            finally
            {
                _channelLock.Release();
            }
        }
        
        public async UniTask<bool> UnsubscribeFromChannelAsync(
            string channelName,
            CancellationToken cancellationToken = default)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            await _channelLock.WaitAsync(effectiveToken);
            try
            {
                effectiveToken.ThrowIfCancellationRequested();
                
                if (!_channels.TryGetValue(channelName, out var channel))
                {
                    Operator.D($"Channel {channelName} not found");
                    return false;
                }
                
                await channel.Unsubscribe();
                _channels.Remove(channelName);
                
                Operator.D($"Unsubscribed from channel: {channelName}");
                return true;
            }
            catch (OperationCanceledException)
            {
                ErrorMessage.Value = "Channel unsubscribe cancelled";
                Operator.D($"Channel unsubscribe cancelled: {channelName}");
                return false;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = $"Failed to unsubscribe from channel: {ex.Message}";
                Operator.D($"Channel unsubscribe failed: {ex.Message}");
                return false;
            }
            finally
            {
                _channelLock.Release();
            }
        }
        
        public async UniTask<bool> BroadcastToChannelAsync<T>(
            string channelName,
            string eventName,
            T payload,
            CancellationToken cancellationToken = default) where T : class
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            try
            {
                effectiveToken.ThrowIfCancellationRequested();
                
                if (!_channels.TryGetValue(channelName, out var channel))
                {
                    ErrorMessage.Value = $"Channel {channelName} not found";
                    return false;
                }
                
                await channel.Send(eventName, payload);
                
                Operator.D($"Broadcast sent to channel {channelName}: {eventName}");
                return true;
            }
            catch (OperationCanceledException)
            {
                ErrorMessage.Value = "Broadcast cancelled";
                Operator.D($"Broadcast cancelled: {channelName}/{eventName}");
                return false;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = $"Failed to broadcast: {ex.Message}";
                Operator.D($"Broadcast failed: {ex.Message}");
                return false;
            }
        }
        
        public async UniTask<bool> TrackPresenceAsync(
            string channelName,
            object presenceState,
            CancellationToken cancellationToken = default)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            try
            {
                effectiveToken.ThrowIfCancellationRequested();
                
                if (!_channels.TryGetValue(channelName, out var channel))
                {
                    ErrorMessage.Value = $"Channel {channelName} not found";
                    return false;
                }
                
                var presence = channel.Register().Presence;
                await presence.Track(presenceState);
                
                Operator.D($"Presence tracked for channel: {channelName}");
                return true;
            }
            catch (OperationCanceledException)
            {
                ErrorMessage.Value = "Presence tracking cancelled";
                Operator.D($"Presence tracking cancelled: {channelName}");
                return false;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = $"Failed to track presence: {ex.Message}";
                Operator.D($"Presence tracking failed: {ex.Message}");
                return false;
            }
        }
        
        public async UniTask<bool> UntrackPresenceAsync(
            string channelName,
            CancellationToken cancellationToken = default)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            try
            {
                effectiveToken.ThrowIfCancellationRequested();
                
                if (!_channels.TryGetValue(channelName, out var channel))
                {
                    ErrorMessage.Value = $"Channel {channelName} not found";
                    return false;
                }
                
                var presence = channel.Register().Presence;
                await presence.Untrack();
                
                Operator.D($"Presence untracked for channel: {channelName}");
                return true;
            }
            catch (OperationCanceledException)
            {
                ErrorMessage.Value = "Presence untracking cancelled";
                Operator.D($"Presence untracking cancelled: {channelName}");
                return false;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = $"Failed to untrack presence: {ex.Message}";
                Operator.D($"Presence untracking failed: {ex.Message}");
                return false;
            }
        }
        
        public RealtimeChannel GetChannel(string channelName)
        {
            return _channels.TryGetValue(channelName, out var channel) ? channel : null;
        }
        
        public IReadOnlyDictionary<string, RealtimeChannel> GetAllChannels()
        {
            return _channels;
        }
        
        public async UniTask DisconnectAsync(CancellationToken cancellationToken = default)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            await _channelLock.WaitAsync(effectiveToken);
            try
            {
                effectiveToken.ThrowIfCancellationRequested();
                
                // Unsubscribe from all channels in parallel with timeout
                var unsubscribeTasks = new List<UniTask>();
                foreach (var channel in _channels.Values)
                {
                    unsubscribeTasks.Add(UnsubscribeChannelSafelyAsync(channel, effectiveToken));
                }
                
                await UniTask.WhenAll(unsubscribeTasks);
                _channels.Clear();
                
                // Disconnect realtime
                if (_supabaseInstance.Client?.Realtime != null)
                {
                    await _supabaseInstance.Client.Realtime.DisconnectAsync();
                }
                
                Operator.D("Realtime disconnected");
            }
            catch (OperationCanceledException)
            {
                Operator.D("Disconnect cancelled");
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = $"Failed to disconnect: {ex.Message}";
                Operator.D($"Disconnect failed: {ex.Message}");
            }
            finally
            {
                _channelLock.Release();
            }
        }
        
        private async UniTask UnsubscribeChannelSafelyAsync(RealtimeChannel channel, CancellationToken cancellationToken)
        {
            try
            {
                // Add a timeout to prevent hanging
                using (var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token))
                {
                    await channel.Unsubscribe().AttachExternalCancellation(linkedCts.Token);
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error unsubscribing channel: {ex.Message}");
            }
        }
        
        private CancellationToken CreateEffectiveToken(CancellationToken externalToken)
        {
            if (_lifetimeCts.Token.IsCancellationRequested)
                return _lifetimeCts.Token;
            
            if (!externalToken.CanBeCanceled)
                return _lifetimeCts.Token;
            
            // Only create linked source if both tokens are active
            return CancellationTokenSource.CreateLinkedTokenSource(_lifetimeCts.Token, externalToken).Token;
        }
        
        public void Dispose()
        {
            _lifetimeCts?.Cancel();
            
            // Use synchronous disposal with timeout
            try
            {
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10)))
                {
                    DisconnectAsync(cts.Token).GetAwaiter().GetResult();
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error during disposal: {ex.Message}");
            }
            
            _lifetimeCts?.Dispose();
            _channelLock?.Dispose();
            _disposables?.Dispose();
            
            // Dispose reactive properties
            IsConnected?.Dispose();
            ConnectionState?.Dispose();
            ErrorMessage?.Dispose();
        }
    }
}