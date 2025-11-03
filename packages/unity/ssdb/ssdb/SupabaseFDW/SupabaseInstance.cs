using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using Supabase;
using Supabase.Functions.Interfaces;
using Supabase.Gotrue;
using Supabase.Gotrue.Interfaces;
using Client = Supabase.Client;
using UnityEngine;
using UnityEngine.Scripting;
using VContainer;
using VContainer.Unity;
using KBVE.SSDB;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator;

namespace KBVE.SSDB.SupabaseFDW
{
    [UnityEngine.Scripting.Preserve]
    public class SupabaseClientWrapper
    {
        public Client Client { get; private set; }
        
        [UnityEngine.Scripting.Preserve]
        public SupabaseClientWrapper()
        {
        }
        
        [UnityEngine.Scripting.Preserve]
        public void Initialize(string url, string anonKey, SupabaseOptions options)
        {
            Client = new Client(url, anonKey, options);
        }
    }

    public class SupabaseInstance : IAsyncStartable, ISupabaseInstance, IDisposable
    {
        private readonly CompositeDisposable _disposables = new();

        private NetworkStatus _networkStatus;
        private SupabaseOptions _options;
        private SupabaseClientWrapper _clientWrapper;
        private CancellationTokenSource _cts;

        public SynchronizedReactiveProperty<bool> Initialized { get; } = new(false);
        public SynchronizedReactiveProperty<Session?> CurrentSession { get; } = new(null);
        public SynchronizedReactiveProperty<User?> CurrentUser { get; } = new(null);
        public SynchronizedReactiveProperty<bool> Online { get; } = new(false);

        public Client Client => _clientWrapper?.Client;

        private readonly Subject<AuthStateChangedEvent> _authStateSubject = new();
        public Observable<AuthStateChangedEvent> AuthStateStream => _authStateSubject;

        [Inject]
        public SupabaseInstance()
        {
            _clientWrapper = new SupabaseClientWrapper();
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            await Operator.R();
            _cts.Token.ThrowIfCancellationRequested();

            _networkStatus = new NetworkStatus();
            _options = new SupabaseOptions
            {
                AutoRefreshToken = true,
                AutoConnectRealtime = false, // Disable auto-connect, let RealtimeFDW handle it explicitly
                Headers = new Dictionary<string, string>()
            };

            try
            {
                _clientWrapper.Initialize(SupabaseInfo.Url, SupabaseInfo.AnonKey, _options);
            }
            catch (Exception e)
            {
                Debug.LogError($"[SupabaseInstance] Failed to initialize Supabase client: {e.Message}");
                Operator.D($"Failed to initialize Supabase client: {e.Message}");
                PostMessage(NotificationType.Debug, $"Initialization Error {e.GetType()}", e);
                throw;
            }

            _clientWrapper.Client.Auth.AddDebugListener(DebugListener);
            _networkStatus.Client = (Supabase.Gotrue.Client)_clientWrapper.Client.Auth;
            _clientWrapper.Client.Auth.SetPersistence(new UnitySession());
            _clientWrapper.Client.Auth.AddStateChangedListener((sender, state) => UnityAuthListener(state, sender.CurrentSession));
            _clientWrapper.Client.Auth.LoadSession();
            _clientWrapper.Client.Auth.Options.AllowUnconfirmedUserSessions = true;

            var currentSession = _clientWrapper.Client.Auth.CurrentSession;
            if (currentSession != null)
            {
                UpdateAuthHeaders(currentSession);
            }

            string url = $"{SupabaseInfo.Url}/auth/v1/settings?apikey={SupabaseInfo.AnonKey}";

            try
            {
                Operator.D($"[SSDB] Testing network connectivity to: {url}");
                _clientWrapper.Client.Auth.Online = await _networkStatus.StartAsync(url);
                Operator.D($"[SSDB] Network status check result: {_clientWrapper.Client.Auth.Online}");
            }
            catch (NotSupportedException)
            {
                Operator.D("[SSDB] Network status not supported on this platform, assuming online");
                _clientWrapper.Client.Auth.Online = true;
            }
            catch (Exception e)
            {
                Operator.D($"[SSDB] Network Error {e.GetType()}: {e.Message}");
                PostMessage(NotificationType.Warning, $"Network connectivity failed, but continuing with offline mode: {e.Message}", e);
                // Don't fail completely - continue with offline mode
                _clientWrapper.Client.Auth.Online = false;
            }

            Online.Value = _clientWrapper.Client.Auth.Online;
            Operator.D($"[SSDB] Connection state set to: {Online.Value}");

            // Always try to initialize, even if offline
            try
            {
                // Add timeout to prevent hanging indefinitely
                var initTask = _clientWrapper.Client.InitializeAsync().AsUniTask();
                var timeoutTask = UniTask.Delay(TimeSpan.FromSeconds(10), cancellationToken: cancellationToken);
                var (hasResultLeft, _) = await UniTask.WhenAny(initTask, timeoutTask);

                // hasResultLeft is true if the first task (initTask) completed, false if second task (timeoutTask) completed
                if (!hasResultLeft)
                {
                    Debug.LogError("[SupabaseInstance] Client.InitializeAsync() timed out after 10 seconds");
                    throw new TimeoutException("Supabase Client.InitializeAsync() timed out after 10 seconds");
                }

                Operator.D("[SSDB] Client initialized successfully");

                if (_clientWrapper.Client.Auth.Online)
                {
                    // Add timeout to Settings() as well
                    var settingsTask = _clientWrapper.Client.Auth.Settings().AsUniTask();
                    var settingsTimeoutTask = UniTask.Delay(TimeSpan.FromSeconds(10), cancellationToken: cancellationToken);
                    var (settingsHasResultLeft, _) = await UniTask.WhenAny(settingsTask, settingsTimeoutTask);

                    if (!settingsHasResultLeft)
                    {
                        Debug.LogWarning("[SupabaseInstance] Auth.Settings() timed out after 10 seconds, continuing anyway");
                    }
                    else
                    {
                        Operator.D("[SSDB] Auth settings retrieved successfully");
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"[SupabaseInstance] Client initialization error: {e.Message}");
                Debug.LogException(e);
                Operator.D($"[SSDB] Client initialization error: {e.Message}");
                PostMessage(NotificationType.Error, $"Supabase client initialization failed: {e.Message}", e);
                throw; // This should fail the startup
            }

            Initialized.Value = true;
            Operator.D("[SSDB] Supabase initialization completed");
        }

        private void UnityAuthListener(Constants.AuthState state, Session session)
        {
            CurrentSession.Value = session;
            CurrentUser.Value = session?.User;
            _authStateSubject.OnNext(new AuthStateChangedEvent(state, session));
            
            UpdateAuthHeaders(session);
        }
        
        private void UpdateAuthHeaders(Session session)
        {
            if (session != null && !string.IsNullOrEmpty(session.AccessToken))
            {
                if (_options?.Headers != null)
                {
                    _options.Headers["Authorization"] = "Bearer " + session.AccessToken;
                }
                
                if (_clientWrapper?.Client?.Realtime != null)
                {
                    _clientWrapper.Client.Realtime.SetAuth(session.AccessToken);
                }
            }
        }


        private void DebugListener(string message, Exception ex)
        {
            if (ex != null)
                Debug.LogError($"[Supabase Auth] {message}\n{ex}");
            else
                Debug.Log($"[Supabase Auth] {message}");
        }



        private void PostMessage(NotificationType type, string message, Exception e = null)
        {
            Debug.Log($"{type}: {message}");
            if (e != null) Debug.LogException(e);
        }

        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _authStateSubject.OnCompleted();
            _authStateSubject.Dispose();
            _disposables.Dispose();
        }
    }
}


