using System;
using System.Threading;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using R3;
using Supabase.Gotrue;
using Supabase.Gotrue.Interfaces;
using VContainer;
using VContainer.Unity;
using UnityEngine;
using KBVE.SSDB;
using KBVE.MMExtensions.Orchestrator;

namespace KBVE.SSDB.SupabaseFDW
{
    public class SupabaseAuthFDW : IAsyncStartable, IDisposable
    {
        private readonly ISupabaseInstance _supabaseInstance;
        private readonly SupabaseWebServer _webServer;
        private readonly CompositeDisposable _disposables = new();
        private readonly CancellationTokenSource _cts = new();
        
        public ReactiveProperty<bool> IsAuthenticated { get; } = new(false);
        public ReactiveProperty<string> ErrorMessage { get; } = new(string.Empty);
        
        [Inject]
        public SupabaseAuthFDW(ISupabaseInstance supabaseInstance, SupabaseWebServer webServer)
        {
            _supabaseInstance = supabaseInstance;
            _webServer = webServer;
        }
        
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            // Link the provided cancellation token with our class-level token
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                _supabaseInstance.CurrentSession
                    .Subscribe(session =>
                    {
                        IsAuthenticated.Value = session != null;
                    })
                    .AddTo(_disposables);
                    
                _supabaseInstance.AuthStateStream
                    .Subscribe(authEvent =>
                    {
                        HandleAuthStateChange(authEvent);
                    })
                    .AddTo(_disposables);
                    
                await UniTask.CompletedTask;
            }
        }
        
        public async UniTask<bool> SignInWithEmailAsync(string email, string password, CancellationToken cancellationToken = default)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                try
                {
                    if (!_supabaseInstance.Initialized.Value)
                    {
                        ErrorMessage.Value = "Supabase client not initialized";
                        return false;
                    }
                    
                    linkedCts.Token.ThrowIfCancellationRequested();
                    var session = await _supabaseInstance.Client.Auth.SignIn(email, password);
                    return session != null;
                }
                catch (OperationCanceledException)
                {
                    ErrorMessage.Value = "Operation cancelled";
                    Operator.D("SignIn cancelled");
                    return false;
                }
                catch (Exception ex)
                {
                    ErrorMessage.Value = ex.Message;
                    Operator.D($"SignIn failed: {ex.Message}");
                    return false;
                }
            }
        }
        
        public async UniTask<bool> SignUpWithEmailAsync(string email, string password, CancellationToken cancellationToken = default)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                try
                {
                    if (!_supabaseInstance.Initialized.Value)
                    {
                        ErrorMessage.Value = "Supabase client not initialized";
                        return false;
                    }
                    
                    linkedCts.Token.ThrowIfCancellationRequested();
                    var session = await _supabaseInstance.Client.Auth.SignUp(email, password);
                    return session != null;
                }
                catch (OperationCanceledException)
                {
                    ErrorMessage.Value = "Operation cancelled";
                    Operator.D("SignUp cancelled");
                    return false;
                }
                catch (Exception ex)
                {
                    ErrorMessage.Value = ex.Message;
                    Operator.D($"SignUp failed: {ex.Message}");
                    return false;
                }
            }
        }
        
        /// <summary>
        /// Sign in with GitHub using OAuth flow
        /// </summary>
        public async UniTask<bool> SignInWithGithubAsync(CancellationToken cancellationToken = default)
        {
            return await PerformOAuthSignInAsync(() => _webServer.SignInWithGithubAsync(cancellationToken), "GitHub");
        }

        /// <summary>
        /// Sign in with Discord using OAuth flow
        /// </summary>
        public async UniTask<bool> SignInWithDiscordAsync(CancellationToken cancellationToken = default)
        {
            return await PerformOAuthSignInAsync(() => _webServer.SignInWithDiscordAsync(cancellationToken), "Discord");
        }

        /// <summary>
        /// Sign in with Twitch using OAuth flow
        /// </summary>
        public async UniTask<bool> SignInWithTwitchAsync(CancellationToken cancellationToken = default)
        {
            return await PerformOAuthSignInAsync(() => _webServer.SignInWithTwitchAsync(cancellationToken), "Twitch");
        }

        /// <summary>
        /// Sign in with OAuth using the specified provider (backwards compatibility)
        /// </summary>
        public async UniTask<bool> SignInWithOAuthAsync(Constants.Provider provider, CancellationToken cancellationToken = default)
        {
            return provider switch
            {
                Constants.Provider.Github => await SignInWithGithubAsync(cancellationToken),
                Constants.Provider.Discord => await SignInWithDiscordAsync(cancellationToken),
                Constants.Provider.Twitch => await SignInWithTwitchAsync(cancellationToken),
                _ => throw new ArgumentException($"OAuth provider {provider} is not supported", nameof(provider))
            };
        }

        private async UniTask<bool> PerformOAuthSignInAsync(Func<Task<Session>> oauthMethod, string providerName)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token))
            {
                try
                {
                    if (!_supabaseInstance.Initialized.Value)
                    {
                        ErrorMessage.Value = "Supabase client not initialized";
                        return false;
                    }

                    Operator.D($"Starting {providerName} OAuth sign-in");
                    var session = await oauthMethod();

                    if (session?.User != null)
                    {
                        ErrorMessage.Value = string.Empty;
                        Operator.D($"{providerName} OAuth sign-in successful for user: {session.User.Email}");
                        return true;
                    }

                    ErrorMessage.Value = $"{providerName} OAuth sign-in failed: No session created";
                    return false;
                }
                catch (OperationCanceledException)
                {
                    ErrorMessage.Value = "Operation cancelled";
                    Operator.D($"{providerName} OAuth SignIn cancelled");
                    return false;
                }
                catch (Exception ex)
                {
                    ErrorMessage.Value = $"{providerName} OAuth sign-in failed: {ex.Message}";
                    Operator.D($"{providerName} OAuth SignIn failed: {ex.Message}");
                    return false;
                }
            }
        }
        
        public async UniTask<bool> SignOutAsync(CancellationToken cancellationToken = default)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                try
                {
                    if (!_supabaseInstance.Initialized.Value)
                    {
                        ErrorMessage.Value = "Supabase client not initialized";
                        return false;
                    }
                    
                    linkedCts.Token.ThrowIfCancellationRequested();
                    await _supabaseInstance.Client.Auth.SignOut();
                    return true;
                }
                catch (OperationCanceledException)
                {
                    ErrorMessage.Value = "Operation cancelled";
                    Operator.D("SignOut cancelled");
                    return false;
                }
                catch (Exception ex)
                {
                    ErrorMessage.Value = ex.Message;
                    Operator.D($"SignOut failed: {ex.Message}");
                    return false;
                }
            }
        }
        
        public async UniTask<bool> RefreshSessionAsync(CancellationToken cancellationToken = default)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                try
                {
                    if (!_supabaseInstance.Initialized.Value)
                    {
                        ErrorMessage.Value = "Supabase client not initialized";
                        return false;
                    }
                    
                    linkedCts.Token.ThrowIfCancellationRequested();
                    var session = await _supabaseInstance.Client.Auth.RefreshSession();
                    return session != null;
                }
                catch (OperationCanceledException)
                {
                    ErrorMessage.Value = "Operation cancelled";
                    Operator.D("RefreshSession cancelled");
                    return false;
                }
                catch (Exception ex)
                {
                    ErrorMessage.Value = ex.Message;
                    Operator.D($"RefreshSession failed: {ex.Message}");
                    return false;
                }
            }
        }
        
        private void HandleAuthStateChange(AuthStateChangedEvent authEvent)
        {
            switch (authEvent.State)
            {
                case Constants.AuthState.SignedIn:
                    Operator.D("User signed in");
                    ErrorMessage.Value = string.Empty;
                    break;
                    
                case Constants.AuthState.SignedOut:
                    Operator.D("User signed out");
                    ErrorMessage.Value = string.Empty;
                    break;
                    
                case Constants.AuthState.UserUpdated:
                    Operator.D("User updated");
                    break;
                    
                case Constants.AuthState.PasswordRecovery:
                    Operator.D("Password recovery initiated");
                    break;
                    
                case Constants.AuthState.TokenRefreshed:
                    Operator.D("Token refreshed");
                    break;
            }
        }
        
        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _disposables?.Dispose();
        }
    }
}