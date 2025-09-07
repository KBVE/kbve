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
    /// Handles metrics collection and broadcasting via Supabase Realtime
    /// </summary>
    public class SupabaseMetrics : IAsyncStartable, IDisposable
    {
        private readonly SupabaseRealtimeFDW _realtimeFDW;
        private readonly SupabaseAuthFDW _authFDW;
        private readonly ISupabaseInstance _supabaseInstance;
        private readonly CompositeDisposable _disposables = new();
        private readonly CancellationTokenSource _lifetimeCts = new();
        
        private RealtimeBroadcast<MetricsPayload> _realtimeBroadcast;
        private DateTime _sessionStartTime;
        
        public ReactiveProperty<bool> IsBroadcasting { get; } = new(false);
        public ReactiveProperty<string> SessionId { get; } = new(string.Empty);
        public ReactiveProperty<string> BroadcastChannelName { get; } = new("demo");
        
        // Metrics tracking
        public ReactiveProperty<int> EventCount { get; } = new(0);
        public ReactiveProperty<float> FPS { get; } = new(0f);
        public ReactiveProperty<long> MemoryUsage { get; } = new(0);
        public ReactiveProperty<float> CPUUsage { get; } = new(0f);
        
        [Inject]
        public SupabaseMetrics(SupabaseRealtimeFDW realtimeFDW, SupabaseAuthFDW authFDW, ISupabaseInstance supabaseInstance)
        {
            _realtimeFDW = realtimeFDW;
            _authFDW = authFDW;
            _supabaseInstance = supabaseInstance;
        }
        
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            try
            {
                _sessionStartTime = DateTime.UtcNow;
                InitializeSessionId();
                await WaitForRealtimeConnectionAsync(effectiveToken);
                await InitializeBroadcastChannelAsync(effectiveToken);
                await BroadcastInitialMetricsAsync(effectiveToken);
                StartMetricsCollection(effectiveToken);
                Operator.D("SupabaseMetrics started successfully");
            }
            catch (OperationCanceledException)
            {
                Operator.D("SupabaseMetrics startup cancelled");
            }
            catch (Exception ex)
            {
                Operator.D($"SupabaseMetrics startup failed: {ex.Message}");
            }
        }
        
        private async UniTask WaitForRealtimeConnectionAsync(CancellationToken cancellationToken)
        {
            const int maxWaitSeconds = 30;
            var waitTime = TimeSpan.FromSeconds(0.5f);
            var maxAttempts = maxWaitSeconds * 2;
            var attempts = 0;
            
            while (!_realtimeFDW.IsConnected.Value && attempts < maxAttempts)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await UniTask.Delay(waitTime, cancellationToken: cancellationToken);
                attempts++;
            }
            
            if (!_realtimeFDW.IsConnected.Value)
            {
                throw new TimeoutException("Realtime connection timeout waiting for metrics broadcast setup");
            }
        }
        
        private async UniTask InitializeBroadcastChannelAsync(CancellationToken cancellationToken)
        {
            try
            {
                _realtimeBroadcast = await _realtimeFDW.CreateBroadcastAsync<MetricsPayload>(
                    BroadcastChannelName.Value,
                    OnMetricsBroadcastReceived,
                    cancellationToken);
                
                if (_realtimeBroadcast != null)
                {
                    IsBroadcasting.Value = true;
                    Operator.D($"Metrics broadcast channel '{BroadcastChannelName.Value}' initialized");
                }
                else
                {
                    throw new Exception("Failed to create metrics broadcast instance");
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Failed to initialize metrics broadcast channel: {ex.Message}");
                throw;
            }
        }
        
        private async UniTask BroadcastInitialMetricsAsync(CancellationToken cancellationToken)
        {
            try
            {
                var initialPayload = new MetricsPayload
                {
                    SessionId = SessionId.Value,
                    PlayerId = GetPlayerId(),
                    EventType = "metrics_init",
                    FPS = GetCurrentFPS(),
                    MemoryUsageMB = GetMemoryUsageMB(),
                    CPUUsage = GetCPUUsage(),
                    EventCount = EventCount.Value,
                    SessionDuration = TimeSpan.Zero,
                    Platform = Application.platform.ToString(),
                    DeviceModel = SystemInfo.deviceModel,
                    DeviceType = SystemInfo.deviceType.ToString()
                };
                
                var success = await _realtimeBroadcast.Send("message", initialPayload);
                
                if (success)
                {
                    Operator.D($"Initial metrics broadcast sent - Session: {SessionId.Value}");
                }
                else
                {
                    Operator.D("Failed to send initial metrics broadcast");
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error broadcasting initial metrics: {ex.Message}");
            }
        }
        
        private void StartMetricsCollection(CancellationToken cancellationToken)
        {
            CollectMetricsLoop(cancellationToken).Forget();
            BroadcastMetricsLoop(cancellationToken).Forget();
        }
        
        private async UniTaskVoid CollectMetricsLoop(CancellationToken cancellationToken)
        {
            var collectionInterval = TimeSpan.FromSeconds(1);
            
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await UniTask.Delay(collectionInterval, cancellationToken: cancellationToken);
                    
                    FPS.Value = GetCurrentFPS();
                    MemoryUsage.Value = GetMemoryUsageMB();
                    CPUUsage.Value = GetCPUUsage();
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Operator.D($"Metrics collection error: {ex.Message}");
                }
            }
        }
        
        private async UniTaskVoid BroadcastMetricsLoop(CancellationToken cancellationToken)
        {
            var broadcastInterval = TimeSpan.FromSeconds(30);
            
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await UniTask.Delay(broadcastInterval, cancellationToken: cancellationToken);
                    
                    if (IsBroadcasting.Value && _realtimeBroadcast != null)
                    {
                        var metricsPayload = new MetricsPayload
                        {
                            SessionId = SessionId.Value,
                            PlayerId = GetPlayerId(),
                            EventType = "metrics_update",
                            FPS = FPS.Value,
                            MemoryUsageMB = MemoryUsage.Value,
                            CPUUsage = CPUUsage.Value,
                            EventCount = EventCount.Value,
                            SessionDuration = DateTime.UtcNow - _sessionStartTime,
                            Platform = Application.platform.ToString(),
                            DeviceModel = SystemInfo.deviceModel,
                            DeviceType = SystemInfo.deviceType.ToString()
                        };
                        
                        await _realtimeBroadcast.Send("message", metricsPayload);
                        
                        Operator.D($"Metrics broadcast sent - FPS: {metricsPayload.FPS:F1}, Memory: {metricsPayload.MemoryUsageMB}MB");
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Operator.D($"Metrics broadcast error: {ex.Message}");
                }
            }
        }
        
        public void TrackEvent(string eventName)
        {
            EventCount.Value++;
            
            if (IsBroadcasting.Value && _realtimeBroadcast != null)
            {
                BroadcastEventAsync(eventName, _lifetimeCts.Token).Forget();
            }
        }
        
        private async UniTaskVoid BroadcastEventAsync(string eventName, CancellationToken cancellationToken)
        {
            try
            {
                var eventPayload = new MetricsPayload
                {
                    SessionId = SessionId.Value,
                    PlayerId = GetPlayerId(),
                    EventType = "custom_event",
                    EventName = eventName,
                    FPS = FPS.Value,
                    MemoryUsageMB = MemoryUsage.Value,
                    CPUUsage = CPUUsage.Value,
                    EventCount = EventCount.Value,
                    SessionDuration = DateTime.UtcNow - _sessionStartTime,
                    Platform = Application.platform.ToString()
                };
                
                await _realtimeBroadcast.Send("message", eventPayload);
            }
            catch (Exception ex)
            {
                Operator.D($"Error broadcasting event '{eventName}': {ex.Message}");
            }
        }
        
        private void OnMetricsBroadcastReceived(MetricsPayload payload)
        {
            if (payload.SessionId == SessionId.Value) return;
            
            switch (payload.EventType)
            {
                case "metrics_init":
                    Operator.D($"Metrics session started - Device: {payload.DeviceModel}, Platform: {payload.Platform}");
                    break;
                case "metrics_update":
                    Operator.D($"Metrics update - FPS: {payload.FPS:F1}, Memory: {payload.MemoryUsageMB}MB, Events: {payload.EventCount}");
                    break;
                case "custom_event":
                    Operator.D($"Custom event received: {payload.EventName}");
                    break;
            }
        }
        
        private float GetCurrentFPS()
        {
            return 1.0f / Time.deltaTime;
        }
        
        private long GetMemoryUsageMB()
        {
            return GC.GetTotalMemory(false) / (1024 * 1024);
        }
        
        private float GetCPUUsage()
        {
            // Simplified CPU usage based on frame time
            // In a real implementation, you might want to use platform-specific APIs
            var targetFrameTime = 1.0f / Application.targetFrameRate;
            var actualFrameTime = Time.deltaTime;
            return Mathf.Clamp01(actualFrameTime / targetFrameTime) * 100f;
        }
        
        private void InitializeSessionId()
        {
            try
            {
                if (_authFDW.IsAuthenticated.Value && _supabaseInstance.Client?.Auth != null)
                {
                    var session = _supabaseInstance.Client.Auth.CurrentSession;
                    if (session != null && !string.IsNullOrEmpty(session.AccessToken))
                    {
                        SessionId.Value = $"metrics_{session.AccessToken.Substring(0, 8)}";
                    }
                    else
                    {
                        var user = _supabaseInstance.Client.Auth.CurrentUser;
                        SessionId.Value = user?.Id ?? $"metrics_auth_{Guid.NewGuid().ToString().Substring(0, 8)}";
                    }
                }
                else
                {
                    SessionId.Value = $"metrics_anon_{Guid.NewGuid().ToString().Substring(0, 8)}";
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error initializing metrics session ID: {ex.Message}");
                SessionId.Value = $"metrics_error_{Guid.NewGuid().ToString().Substring(0, 8)}";
            }
        }
        
        private string GetPlayerId()
        {
            try
            {
                if (_authFDW.IsAuthenticated.Value && _supabaseInstance.Client?.Auth != null)
                {
                    var user = _supabaseInstance.Client.Auth.CurrentUser;
                    return user?.Id ?? "authenticated_unknown";
                }
                return "anonymous";
            }
            catch (Exception ex)
            {
                Operator.D($"Error getting player ID: {ex.Message}");
                return "anonymous";
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
        
        public async UniTask BroadcastFinalMetricsAsync(CancellationToken cancellationToken = default)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            try
            {
                if (!IsBroadcasting.Value || _realtimeBroadcast == null) return;
                
                var finalPayload = new MetricsPayload
                {
                    SessionId = SessionId.Value,
                    PlayerId = GetPlayerId(),
                    EventType = "metrics_end",
                    FPS = FPS.Value,
                    MemoryUsageMB = MemoryUsage.Value,
                    CPUUsage = CPUUsage.Value,
                    EventCount = EventCount.Value,
                    SessionDuration = DateTime.UtcNow - _sessionStartTime,
                    Platform = Application.platform.ToString()
                };
                
                await _realtimeBroadcast.Send("message", finalPayload);
                
                Operator.D($"Final metrics broadcast sent - Total Events: {EventCount.Value}, Duration: {finalPayload.SessionDuration.TotalMinutes:F1}m");
            }
            catch (Exception ex)
            {
                Operator.D($"Error broadcasting final metrics: {ex.Message}");
            }
        }
        
        public void Dispose()
        {
            _lifetimeCts?.Cancel();
            
            try
            {
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                {
                    BroadcastFinalMetricsAsync(cts.Token).GetAwaiter().GetResult();
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error during metrics disposal: {ex.Message}");
            }
            
            IsBroadcasting.Value = false;
            
            _lifetimeCts?.Dispose();
            _disposables?.Dispose();
            
            IsBroadcasting?.Dispose();
            SessionId?.Dispose();
            BroadcastChannelName?.Dispose();
            EventCount?.Dispose();
            FPS?.Dispose();
            MemoryUsage?.Dispose();
            CPUUsage?.Dispose();
        }
    }
    
    /// <summary>
    /// Payload for metrics broadcasts
    /// </summary>
    public class MetricsPayload : BaseBroadcast
    {
        [JsonProperty("session_id")]
        public string SessionId { get; set; }
        
        [JsonProperty("player_id")]
        public string PlayerId { get; set; }
        
        [JsonProperty("event_type")]
        public string EventType { get; set; }
        
        [JsonProperty("event_name")]
        public string EventName { get; set; }
        
        [JsonProperty("fps")]
        public float FPS { get; set; }
        
        [JsonProperty("memory_usage_mb")]
        public long MemoryUsageMB { get; set; }
        
        [JsonProperty("cpu_usage")]
        public float CPUUsage { get; set; }
        
        [JsonProperty("event_count")]
        public int EventCount { get; set; }
        
        [JsonProperty("session_duration")]
        public TimeSpan SessionDuration { get; set; }
        
        [JsonProperty("platform")]
        public string Platform { get; set; }
        
        [JsonProperty("device_model")]
        public string DeviceModel { get; set; }
        
        [JsonProperty("device_type")]
        public string DeviceType { get; set; }
        
        [JsonProperty("timestamp")]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}