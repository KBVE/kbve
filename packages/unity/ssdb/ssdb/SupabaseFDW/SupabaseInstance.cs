using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using Supabase;
using Supabase.Gotrue;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.SSDB;

namespace KBVE.SSDB.SupabaseFDW
{
    public class SupabaseInstance : IAsyncStartable, ISupabaseInstance, IDisposable
    {
        private readonly CompositeDisposable _disposables = new();

        private NetworkStatus _networkStatus;
        private SupabaseOptions _options;
        private Supabase.Client _supabase;

        public ReactiveProperty<bool> Initialized { get; } = new(false);
        public ReactiveProperty<Session?> CurrentSession { get; } = new(null);
        public ReactiveProperty<User?> CurrentUser { get; } = new(null);
        public ReactiveProperty<bool> Online { get; } = new(false);

        public Supabase.Client Client => _supabase;

        private readonly Subject<AuthStateChangedEvent> _authStateSubject = new();
        public IObservable<AuthStateChangedEvent> AuthStateStream => _authStateSubject;

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            _networkStatus = new NetworkStatus();
            _options = new SupabaseOptions
            {
                AutoRefreshToken = true
            };

            _supabase = new Client(SupabaseInfo.Url, SupabaseInfo.AnonKey, _options);

            _supabase.Auth.AddDebugListener(DebugListener);
            _networkStatus.Client = (Supabase.Gotrue.Client)_supabase.Auth;
            _supabase.Auth.SetPersistence(new UnitySession());
            _supabase.Auth.AddStateChangedListener(UnityAuthListener);
            await _supabase.Auth.LoadSession();

            _supabase.Auth.Options.AllowUnconfirmedUserSessions = true;

            string url = $"{SupabaseInfo.Url}/auth/v1/settings?apikey={SupabaseInfo.AnonKey}";

            try
            {
                _supabase.Auth.Online = await _networkStatus.StartAsync(url);
            }
            catch (NotSupportedException)
            {
                _supabase.Auth.Online = true;
            }
            catch (Exception e)
            {
                PostMessage(NotificationType.Debug, $"Network Error {e.GetType()}", e);
                _supabase.Auth.Online = false;
            }

            Online.Value = _supabase.Auth.Online;

            if (_supabase.Auth.Online)
            {
                await _supabase.InitializeAsync();
                await _supabase.Auth.Settings();
            }

            Initialized.Value = true;
        }

        private void UnityAuthListener(IGotrueClient<Session, User>.AuthState state, Session session)
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




