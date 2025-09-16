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

namespace KBVE.SSDB.SupabaseFDW.UIUX
{
    public class SupabaseUIUX : IAsyncStartable, IDisposable
    {
        private readonly ISupabaseInstance _supabaseInstance;
        private readonly SupabaseAuthFDW _authFDW;
        private readonly CompositeDisposable _disposables = new();
        private readonly CancellationTokenSource _cts = new();

        // UI State Properties
        public ReactiveProperty<bool> IsLoading { get; } = new(false);
        public ReactiveProperty<bool> ShowLoginForm { get; } = new(true);
        public ReactiveProperty<string> EmailInput { get; } = new(string.Empty);
        public ReactiveProperty<string> PasswordInput { get; } = new(string.Empty);
        public ReactiveProperty<string> StatusMessage { get; } = new(string.Empty);
        public ReactiveProperty<Constants.AuthState> CurrentAuthState { get; } = new(Constants.AuthState.SignedOut);
        
        // Validation Properties
        public ReactiveProperty<bool> IsEmailValid { get; } = new(false);
        public ReactiveProperty<bool> IsPasswordValid { get; } = new(false);
        public ReactiveProperty<bool> CanSubmit { get; } = new(false);

        [Inject]
        public SupabaseUIUX(ISupabaseInstance supabaseInstance, SupabaseAuthFDW authFDW)
        {
            _supabaseInstance = supabaseInstance;
            _authFDW = authFDW;
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                await Operator.R();
                linkedCts.Token.ThrowIfCancellationRequested();
                
                Operator.D("SupabaseUIUX initializing");

                // Subscribe to auth state changes
                _supabaseInstance.AuthStateStream
                    .Subscribe(authEvent => HandleAuthStateChange(authEvent))
                    .AddTo(_disposables);

                // Subscribe to initialization state
                _supabaseInstance.Initialized
                    .Subscribe(initialized =>
                    {
                        if (initialized)
                        {
                            UpdateUIState();
                            Operator.D("SupabaseUIUX ready");
                        }
                    })
                    .AddTo(_disposables);

                // Subscribe to auth errors
                _authFDW.ErrorMessage
                    .Where(msg => !string.IsNullOrEmpty(msg))
                    .Subscribe(error =>
                    {
                        StatusMessage.Value = error;
                        IsLoading.Value = false;
                        Operator.D($"Auth error: {error}");
                    })
                    .AddTo(_disposables);

                // Setup input validation
                EmailInput
                    .Select(email => IsValidEmail(email))
                    .Subscribe(valid => IsEmailValid.Value = valid)
                    .AddTo(_disposables);

                PasswordInput
                    .Select(password => password.Length >= 6)
                    .Subscribe(valid => IsPasswordValid.Value = valid)
                    .AddTo(_disposables);

                // Combine validation states
                Observable.CombineLatest(
                    IsEmailValid,
                    IsPasswordValid,
                    IsLoading.Select(loading => !loading),
                    (email, password, notLoading) => email && password && notLoading
                )
                .Subscribe(canSubmit => CanSubmit.Value = canSubmit)
                .AddTo(_disposables);

                UpdateUIState();
                await UniTask.CompletedTask;
            }
        }

        public async UniTask HandleLoginAsync(CancellationToken cancellationToken = default)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                try
                {
                    if (!ValidateInputs())
                    {
                        StatusMessage.Value = "Please enter valid email and password";
                        return;
                    }

                    IsLoading.Value = true;
                    StatusMessage.Value = "Logging in...";
                    
                    linkedCts.Token.ThrowIfCancellationRequested();
                    
                    var success = await _authFDW.SignInWithEmailAsync(
                        EmailInput.Value,
                        PasswordInput.Value,
                        linkedCts.Token
                    );

                    if (success)
                    {
                        StatusMessage.Value = "Login successful!";
                        ClearInputs();
                        Operator.D("User logged in successfully");
                    }
                    else
                    {
                        StatusMessage.Value = "Login failed. Please check your credentials.";
                    }
                }
                catch (OperationCanceledException)
                {
                    StatusMessage.Value = "Login cancelled";
                    Operator.D("Login operation cancelled");
                }
                catch (Exception ex)
                {
                    StatusMessage.Value = $"Login error: {ex.Message}";
                    Operator.D($"Login exception: {ex.Message}");
                }
                finally
                {
                    IsLoading.Value = false;
                }
            }
        }

        public async UniTask HandleRegisterAsync(CancellationToken cancellationToken = default)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                try
                {
                    if (!ValidateInputs())
                    {
                        StatusMessage.Value = "Please enter valid email and password (min 6 characters)";
                        return;
                    }

                    IsLoading.Value = true;
                    StatusMessage.Value = "Creating account...";
                    
                    linkedCts.Token.ThrowIfCancellationRequested();
                    
                    var success = await _authFDW.SignUpWithEmailAsync(
                        EmailInput.Value,
                        PasswordInput.Value,
                        linkedCts.Token
                    );

                    if (success)
                    {
                        StatusMessage.Value = "Registration successful! Please check your email for verification.";
                        ClearInputs();
                        Operator.D("User registered successfully");
                    }
                    else
                    {
                        StatusMessage.Value = "Registration failed. This email may already be registered.";
                    }
                }
                catch (OperationCanceledException)
                {
                    StatusMessage.Value = "Registration cancelled";
                    Operator.D("Registration operation cancelled");
                }
                catch (Exception ex)
                {
                    StatusMessage.Value = $"Registration error: {ex.Message}";
                    Operator.D($"Registration exception: {ex.Message}");
                }
                finally
                {
                    IsLoading.Value = false;
                }
            }
        }

        public async UniTask HandleLogoutAsync(CancellationToken cancellationToken = default)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                try
                {
                    IsLoading.Value = true;
                    StatusMessage.Value = "Logging out...";
                    
                    linkedCts.Token.ThrowIfCancellationRequested();
                    
                    var success = await _authFDW.SignOutAsync(linkedCts.Token);

                    if (success)
                    {
                        StatusMessage.Value = "Logged out successfully";
                        ClearInputs();
                        Operator.D("User logged out successfully");
                    }
                    else
                    {
                        StatusMessage.Value = "Logout failed";
                    }
                }
                catch (OperationCanceledException)
                {
                    StatusMessage.Value = "Logout cancelled";
                    Operator.D("Logout operation cancelled");
                }
                catch (Exception ex)
                {
                    StatusMessage.Value = $"Logout error: {ex.Message}";
                    Operator.D($"Logout exception: {ex.Message}");
                }
                finally
                {
                    IsLoading.Value = false;
                }
            }
        }

        public async UniTask HandleOAuthLoginAsync(Constants.Provider provider, CancellationToken cancellationToken = default)
        {
            using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token))
            {
                try
                {
                    IsLoading.Value = true;
                    StatusMessage.Value = $"Logging in with {provider}...";
                    
                    linkedCts.Token.ThrowIfCancellationRequested();
                    
                    var success = await _authFDW.SignInWithOAuthAsync(provider, linkedCts.Token);

                    if (success)
                    {
                        StatusMessage.Value = "OAuth login successful!";
                        Operator.D($"User logged in via {provider}");
                    }
                    else
                    {
                        StatusMessage.Value = "OAuth login failed";
                    }
                }
                catch (OperationCanceledException)
                {
                    StatusMessage.Value = "OAuth login cancelled";
                    Operator.D("OAuth login cancelled");
                }
                catch (Exception ex)
                {
                    StatusMessage.Value = $"OAuth error: {ex.Message}";
                    Operator.D($"OAuth exception: {ex.Message}");
                }
                finally
                {
                    IsLoading.Value = false;
                }
            }
        }

        public void ToggleFormMode()
        {
            if (IsLoading.Value) return;
            
            ShowLoginForm.Value = !ShowLoginForm.Value;
            StatusMessage.Value = string.Empty;
            Operator.D($"Form mode toggled to: {(ShowLoginForm.Value ? "Login" : "Register")}");
        }

        private bool ValidateInputs()
        {
            if (!IsValidEmail(EmailInput.Value))
            {
                StatusMessage.Value = "Please enter a valid email address";
                return false;
            }

            if (PasswordInput.Value.Length < 6)
            {
                StatusMessage.Value = "Password must be at least 6 characters";
                return false;
            }

            return true;
        }

        private bool IsValidEmail(string email)
        {
            if (string.IsNullOrWhiteSpace(email))
                return false;

            try
            {
                var addr = new System.Net.Mail.MailAddress(email);
                return addr.Address == email;
            }
            catch
            {
                return false;
            }
        }

        private void ClearInputs()
        {
            EmailInput.Value = string.Empty;
            PasswordInput.Value = string.Empty;
        }

        private void UpdateUIState()
        {
            if (!_supabaseInstance.Initialized.Value)
            {
                StatusMessage.Value = "Initializing...";
            }
            else if (_authFDW.IsAuthenticated.Value)
            {
                StatusMessage.Value = $"Welcome, {_supabaseInstance.CurrentUser.Value?.Email ?? "User"}";
            }
            else
            {
                StatusMessage.Value = "Please log in";
            }
        }

        private void HandleAuthStateChange(AuthStateChangedEvent authEvent)
        {
            // Updated to use official AuthState without conversion
            CurrentAuthState.Value = authEvent.State;

            switch (authEvent.State)
            {
                case Constants.AuthState.SignedIn:
                    StatusMessage.Value = "Welcome back!";
                    Operator.D("Auth state: Signed in");
                    break;

                case Constants.AuthState.SignedOut:
                    StatusMessage.Value = "You have been logged out";
                    Operator.D("Auth state: Signed out");
                    break;

                case Constants.AuthState.UserUpdated:
                    Operator.D("Auth state: User updated");
                    break;

                case Constants.AuthState.TokenRefreshed:
                    Operator.D("Auth state: Token refreshed");
                    break;

                case Constants.AuthState.PasswordRecovery:
                    StatusMessage.Value = "Password recovery initiated";
                    Operator.D("Auth state: Password recovery");
                    break;
            }
        }

        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _disposables?.Dispose();
            Operator.D("SupabaseUIUX disposed");
        }
    }
}