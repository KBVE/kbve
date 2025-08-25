using System;
using System.Threading;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using R3;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.SSDB;
using KBVE.MMExtensions.Orchestrator;
using Supabase.Realtime;
using Supabase.Realtime.Models;
using Newtonsoft.Json;

namespace KBVE.SSDB.SupabaseFDW
{
    /// <summary>
    /// Handles game launch and session broadcasting via Supabase Realtime
    /// </summary>
    public class SupabaseBroadcastFDW : IAsyncStartable, IDisposable
    {
        private readonly SupabaseRealtimeFDW _realtimeFDW;
        private readonly SupabaseAuthFDW _authFDW;
        private readonly CompositeDisposable _disposables = new();
        private readonly CancellationTokenSource _lifetimeCts = new();
        
        private RealtimeChannel _broadcastChannel;
        private bool _hasAnnouncedLaunch = false;
        
        public ReactiveProperty<bool> IsBroadcasting { get; } = new(false);
        public ReactiveProperty<string> SessionId { get; } = new(string.Empty);
        public ReactiveProperty<DateTime> LaunchTime { get; } = new(DateTime.UtcNow);
        public ReactiveProperty<string> BroadcastChannelName { get; } = new("game-broadcasts");
        
        [Inject]
        public SupabaseBroadcastFDW(SupabaseRealtimeFDW realtimeFDW, SupabaseAuthFDW authFDW)
        {
            _realtimeFDW = realtimeFDW;
            _authFDW = authFDW;
            
            // Generate unique session ID
            SessionId.Value = Guid.NewGuid().ToString();
        }
        
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            try
            {
                // Wait for realtime to be connected before starting broadcast
                await WaitForRealtimeConnectionAsync(effectiveToken);
                
                // Subscribe to broadcast channel
                await InitializeBroadcastChannelAsync(effectiveToken);
                
                // Send initial game launch broadcast
                await BroadcastGameLaunchAsync(effectiveToken);
                
                // Start periodic heartbeat broadcasts
                StartHeartbeatBroadcasts(effectiveToken);
                
                Operator.D("SupabaseBroadcastFDW started successfully");
            }
            catch (OperationCanceledException)
            {
                Operator.D("SupabaseBroadcastFDW startup cancelled");
            }
            catch (Exception ex)
            {
                Operator.D($"SupabaseBroadcastFDW startup failed: {ex.Message}");
            }
        }
        
        private async UniTask WaitForRealtimeConnectionAsync(CancellationToken cancellationToken)
        {
            // Wait for realtime to be connected with timeout
            const int maxWaitSeconds = 30;
            var waitTime = TimeSpan.FromSeconds(0.5f);
            var maxAttempts = maxWaitSeconds * 2; // 0.5s intervals
            var attempts = 0;
            
            while (!_realtimeFDW.IsConnected.Value && attempts < maxAttempts)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await UniTask.Delay(waitTime, cancellationToken: cancellationToken);
                attempts++;
            }
            
            if (!_realtimeFDW.IsConnected.Value)
            {
                throw new TimeoutException("Realtime connection timeout waiting for broadcast setup");
            }
        }
        
        private async UniTask InitializeBroadcastChannelAsync(CancellationToken cancellationToken)
        {
            try
            {
                // Subscribe to the game broadcast channel
                _broadcastChannel = await _realtimeFDW.SubscribeToChannelAsync(BroadcastChannelName.Value, cancellationToken);
                
                if (_broadcastChannel != null)
                {
                    // Register for receiving broadcasts from other players
                    var broadcast = _broadcastChannel.Register<GameLaunchPayload>(false, true);
                    broadcast.AddBroadcastEventHandler((sender, baseBroadcast) =>
                    {
                        var response = broadcast.Current();
                        if (response is GameLaunchPayload payload)
                        {
                            OnPlayerBroadcastReceived(sender, payload);
                        }
                        Operator.D($"Unexpected payload type: {response}");
                    });
                    
                    IsBroadcasting.Value = true;
                    Operator.D("Broadcast channel initialized");
                }
                else
                {
                    throw new Exception("Failed to subscribe to broadcast channel");
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Failed to initialize broadcast channel: {ex.Message}");
                throw;
            }
        }
        
        private async UniTask BroadcastGameLaunchAsync(CancellationToken cancellationToken)
        {
            if (_hasAnnouncedLaunch) return;
            
            try
            {
                var launchPayload = new GameLaunchPayload
                {
                    SessionId = SessionId.Value,
                    PlayerId = _authFDW.IsAuthenticated.Value ? "authenticated" : "anonymous",
                    LaunchTime = LaunchTime.Value,
                    GameVersion = Application.version,
                    Platform = Application.platform.ToString(),
                    EventType = "game_launch"
                };
                
                var success = await _realtimeFDW.BroadcastToChannelAsync(
                    BroadcastChannelName.Value,
                    "player_launched",
                    launchPayload,
                    cancellationToken
                );
                
                if (success)
                {
                    _hasAnnouncedLaunch = true;
                    Operator.D($"Game launch broadcast sent - Session: {SessionId.Value}");
                }
                else
                {
                    Operator.D("Failed to send game launch broadcast");
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error broadcasting game launch: {ex.Message}");
            }
        }
        
        private void StartHeartbeatBroadcasts(CancellationToken cancellationToken)
        {
            // Send heartbeat every 5 minutes to indicate active session
            HeartbeatLoop(cancellationToken).Forget();
        }
        
        private async UniTaskVoid HeartbeatLoop(CancellationToken cancellationToken)
        {
            var heartbeatInterval = TimeSpan.FromMinutes(5);
            
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await UniTask.Delay(heartbeatInterval, cancellationToken: cancellationToken);
                    
                    if (IsBroadcasting.Value && _broadcastChannel != null)
                    {
                        var heartbeatPayload = new GameLaunchPayload
                        {
                            SessionId = SessionId.Value,
                            PlayerId = _authFDW.IsAuthenticated.Value ? "authenticated" : "anonymous", 
                            LaunchTime = LaunchTime.Value,
                            GameVersion = Application.version,
                            Platform = Application.platform.ToString(),
                            EventType = "session_heartbeat",
                            SessionDuration = DateTime.UtcNow - LaunchTime.Value
                        };
                        
                        await _realtimeFDW.BroadcastToChannelAsync(
                            BroadcastChannelName.Value,
                            "session_heartbeat",
                            heartbeatPayload,
                            cancellationToken
                        );
                        
                        Operator.D($"Session heartbeat sent - Duration: {heartbeatPayload.SessionDuration?.TotalMinutes:F1}m");
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Operator.D($"Heartbeat broadcast error: {ex.Message}");
                }
            }
        }
        
        public async UniTask BroadcastGameExitAsync(CancellationToken cancellationToken = default)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            try
            {
                if (!IsBroadcasting.Value || _broadcastChannel == null) return;
                
                var exitPayload = new GameLaunchPayload
                {
                    SessionId = SessionId.Value,
                    PlayerId = _authFDW.IsAuthenticated.Value ? "authenticated" : "anonymous",
                    LaunchTime = LaunchTime.Value,
                    GameVersion = Application.version,
                    Platform = Application.platform.ToString(),
                    EventType = "game_exit",
                    SessionDuration = DateTime.UtcNow - LaunchTime.Value
                };
                
                await _realtimeFDW.BroadcastToChannelAsync(
                    BroadcastChannelName.Value,
                    "player_exited",
                    exitPayload,
                    effectiveToken
                );
                
                Operator.D($"Game exit broadcast sent - Session Duration: {exitPayload.SessionDuration?.TotalMinutes:F1}m");
            }
            catch (Exception ex)
            {
                Operator.D($"Error broadcasting game exit: {ex.Message}");
            }
        }
        
        private void OnPlayerBroadcastReceived(object sender, GameLaunchPayload payload)
        {
            // Ignore our own broadcasts
            if (payload.SessionId == SessionId.Value) return;
            
            switch (payload.EventType)
            {
                case "game_launch":
                    Operator.D($"Player launched game - Platform: {payload.Platform}, Version: {payload.GameVersion}");
                    break;
                case "session_heartbeat":
                    Operator.D($"Player session active - Duration: {payload.SessionDuration?.TotalMinutes:F1}m");
                    break;
                case "game_exit":
                    Operator.D($"Player exited game - Session Duration: {payload.SessionDuration?.TotalMinutes:F1}m");
                    break;
            }
        }
        
        private CancellationToken CreateEffectiveToken(CancellationToken externalToken)
        {
            if (_lifetimeCts.Token.IsCancellationRequested)
                return _lifetimeCts.Token;
            
            if (!externalToken.CanBeCanceled)
                return _lifetimeCts.Token;
            
            return CancellationTokenSource.CreateLinkedTokenSource(_lifetimeCts.Token, externalToken).Token;
        }
        
        public void Dispose()
        {
            _lifetimeCts?.Cancel();
            
            // Send exit broadcast before disposing
            try
            {
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                {
                    BroadcastGameExitAsync(cts.Token).GetAwaiter().GetResult();
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error during broadcast disposal: {ex.Message}");
            }
            
            IsBroadcasting.Value = false;
            
            _lifetimeCts?.Dispose();
            _disposables?.Dispose();
            
            IsBroadcasting?.Dispose();
            SessionId?.Dispose();
            LaunchTime?.Dispose();
            BroadcastChannelName?.Dispose();
        }
    }
    
    /// <summary>
    /// Payload for game launch and session broadcasts
    /// </summary>
    [Serializable]
    public class GameLaunchPayload : BaseBroadcast
    {
        [JsonProperty("session_id")]
        public string SessionId { get; set; }
        
        [JsonProperty("player_id")]
        public string PlayerId { get; set; }
        
        [JsonProperty("launch_time")]
        public DateTime LaunchTime { get; set; }
        
        [JsonProperty("game_version")]
        public string GameVersion { get; set; }
        
        [JsonProperty("platform")]
        public string Platform { get; set; }
        
        [JsonProperty("event_type")]
        public string EventType { get; set; }
        
        [JsonProperty("session_duration")]
        public TimeSpan? SessionDuration { get; set; }
        
        [JsonProperty("timestamp")]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}