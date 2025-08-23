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
        private readonly CompositeDisposable _disposables = new();
        private CancellationTokenSource _cts;
        
        public ReactiveProperty<bool> IsAuthenticated { get; } = new(false);
        public ReactiveProperty<string> ErrorMessage { get; } = new(string.Empty);
        
        [Inject]
        public SupabaseAuthFDW(ISupabaseInstance supabaseInstance)
        {
            _supabaseInstance = supabaseInstance;
        }
        
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            
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
                
            // Wait for Supabase to be initialized
            await _supabaseInstance.Initialized.WaitUntilValueChangedAsync(_cts.Token);
            _cts.Token.ThrowIfCancellationRequested();
            
            // Check if there's an existing session after initialization
            if (_supabaseInstance.CurrentSession.Value != null)
            {
                IsAuthenticated.Value = true;
                Operator.D($"Existing session found for user: {_supabaseInstance.CurrentUser.Value?.Email}");
            }
        }
        
        public async UniTask<bool> SignInWithEmailAsync(string email, string password, CancellationToken cancellationToken = default)
        {
            try
            {
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(_cts?.Token ?? default, cancellationToken);
                
                if (!_supabaseInstance.Initialized.Value)
                {
                    ErrorMessage.Value = "Supabase client not initialized";
                    return false;
                }
                
                linkedCts.Token.ThrowIfCancellationRequested();
                var session = await _supabaseInstance.Client.Auth.SignIn(email, password);
                return session != null;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = ex.Message;
                Operator.D($"SignIn failed: {ex.Message}");
                return false;
            }
        }
        
        public async UniTask<bool> SignUpWithEmailAsync(string email, string password, CancellationToken cancellationToken = default)
        {
            try
            {
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(_cts?.Token ?? default, cancellationToken);
                
                if (!_supabaseInstance.Initialized.Value)
                {
                    ErrorMessage.Value = "Supabase client not initialized";
                    return false;
                }
                
                linkedCts.Token.ThrowIfCancellationRequested();
                var session = await _supabaseInstance.Client.Auth.SignUp(email, password);
                return session != null;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = ex.Message;
                Operator.D($"SignUp failed: {ex.Message}");
                return false;
            }
        }
        
        public async UniTask<bool> SignInWithOAuthAsync(Constants.Provider provider, CancellationToken cancellationToken = default)
        {
            try
            {
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(_cts?.Token ?? default, cancellationToken);
                
                if (!_supabaseInstance.Initialized.Value)
                {
                    ErrorMessage.Value = "Supabase client not initialized";
                    return false;
                }
                
                linkedCts.Token.ThrowIfCancellationRequested();
                var providerAuth = await _supabaseInstance.Client.Auth.SignIn(provider);
                return providerAuth != null;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = ex.Message;
                Operator.D($"OAuth SignIn failed: {ex.Message}");
                return false;
            }
        }
        
        public async UniTask<bool> SignOutAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(_cts?.Token ?? default, cancellationToken);
                
                if (!_supabaseInstance.Initialized.Value)
                {
                    ErrorMessage.Value = "Supabase client not initialized";
                    return false;
                }
                
                linkedCts.Token.ThrowIfCancellationRequested();
                await _supabaseInstance.Client.Auth.SignOut();
                return true;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = ex.Message;
                Operator.D($"SignOut failed: {ex.Message}");
                return false;
            }
        }
        
        public async UniTask<bool> RefreshSessionAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(_cts?.Token ?? default, cancellationToken);
                
                if (!_supabaseInstance.Initialized.Value)
                {
                    ErrorMessage.Value = "Supabase client not initialized";
                    return false;
                }
                
                linkedCts.Token.ThrowIfCancellationRequested();
                var session = await _supabaseInstance.Client.Auth.RefreshSession();
                return session != null;
            }
            catch (Exception ex)
            {
                ErrorMessage.Value = ex.Message;
                Operator.D($"RefreshSession failed: {ex.Message}");
                return false;
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