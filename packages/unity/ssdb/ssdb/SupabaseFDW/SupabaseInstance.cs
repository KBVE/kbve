using System;
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
    // Wrapper class to hold Supabase client and prevent code stripping
    [UnityEngine.Scripting.Preserve]
    public class SupabaseClientWrapper
    {
        public Client Client { get; private set; }
        
        [UnityEngine.Scripting.Preserve]
        public SupabaseClientWrapper()
        {
            // Empty constructor for VContainer and to prevent stripping
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

        public ReactiveProperty<bool> Initialized { get; } = new(false);
        public ReactiveProperty<Session?> CurrentSession { get; } = new(null);
        public ReactiveProperty<User?> CurrentUser { get; } = new(null);
        public ReactiveProperty<bool> Online { get; } = new(false);

        public Client Client => _clientWrapper?.Client;

        private readonly Subject<AuthStateChangedEvent> _authStateSubject = new();
        public Observable<AuthStateChangedEvent> AuthStateStream => _authStateSubject;

        [Inject]
        public SupabaseInstance()
        {
            // Create wrapper instance - VContainer will handle this
            _clientWrapper = new SupabaseClientWrapper();
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            await Operator.R();
            _networkStatus = new NetworkStatus();
            _options = new SupabaseOptions
            {
                AutoRefreshToken = true,
                AutoConnectRealtime = false
            };

            // Initialize the client through the wrapper to prevent stripping issues
            _clientWrapper.Initialize(SupabaseInfo.Url, SupabaseInfo.AnonKey, _options);

            _clientWrapper.Client.Auth.AddDebugListener(DebugListener);
            _networkStatus.Client = (Supabase.Gotrue.Client)_clientWrapper.Client.Auth;
            _clientWrapper.Client.Auth.SetPersistence(new UnitySession());
            _clientWrapper.Client.Auth.AddStateChangedListener((sender, state) => UnityAuthListener(state, sender.CurrentSession));
            _clientWrapper.Client.Auth.LoadSession();
            _clientWrapper.Client.Auth.Options.AllowUnconfirmedUserSessions = true;

            string url = $"{SupabaseInfo.Url}/auth/v1/settings?apikey={SupabaseInfo.AnonKey}";

            try
            {
                _clientWrapper.Client.Auth.Online = await _networkStatus.StartAsync(url);
            }
            catch (NotSupportedException)
            {
                _clientWrapper.Client.Auth.Online = true;
            }
            catch (Exception e)
            {
                PostMessage(NotificationType.Debug, $"Network Error {e.GetType()}", e);
                _clientWrapper.Client.Auth.Online = false;
            }

            Online.Value = _clientWrapper.Client.Auth.Online;

            if (_clientWrapper.Client.Auth.Online)
            {
                await _clientWrapper.Client.InitializeAsync();
                await _clientWrapper.Client.Auth.Settings();
            }

            Initialized.Value = true;
        }

        private void UnityAuthListener(Constants.AuthState state, Session session)
        {
            CurrentSession.Value = session;
            CurrentUser.Value = session?.User;
            _authStateSubject.OnNext(new AuthStateChangedEvent(state, session));
        }

        private void DebugListener(string message, Exception ex)
        {
            if (ex != null)
                Debug.LogError($"[Supabase Auth] {message}\n{ex}");
            else
                Debug.Log($"[Supabase Auth] {message}");
        }

        public void Dispose()
        {
            _authStateSubject.OnCompleted();
            _authStateSubject.Dispose();
            _disposables.Dispose();
        }

        private void PostMessage(NotificationType type, string message, Exception e = null)
        {
            Debug.Log($"{type}: {message}");
            if (e != null) Debug.LogException(e);
        }
    }
}


