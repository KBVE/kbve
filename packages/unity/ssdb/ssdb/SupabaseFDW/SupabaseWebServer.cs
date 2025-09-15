using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using VContainer;
using VContainer.Unity;
using KBVE.SSDB.SupabaseFDW;
using System.Net;
using System.Threading.Tasks;
using Supabase.Gotrue;
using Supabase.Gotrue.Exceptions;
using static Supabase.Gotrue.Constants;

namespace KBVE.SSDB.SupabaseFDW
{
    /// <summary>
    /// OAuth service for handling authentication flows with GitHub, Discord, and Twitch.
    /// Manages local webserver for OAuth callbacks and token exchange.
    /// </summary>
    public class SupabaseWebServer : IAsyncStartable, IDisposable
    {
        private readonly ISupabaseInstance _supabaseInstance;
        private readonly CancellationTokenSource _cts = new();

        private const string DefaultRedirectUrl = "http://localhost:3000/";
        private HttpListener _httpListener;

        // OAuth flow state
        private TaskCompletionSource<string> _authCodeTcs;
        private string _pkceVerifier;

        [Inject]
        public SupabaseWebServer(ISupabaseInstance supabaseInstance)
        {
            _supabaseInstance = supabaseInstance;
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            // Wait for SupabaseInstance to be initialized
            await UniTask.WaitUntil(() => _supabaseInstance.Initialized.Value, cancellationToken: cancellationToken);
            UnityEngine.Debug.Log("[SupabaseWebServer] OAuth service initialized and ready.");
        }

        #region Public OAuth Methods

        /// <summary>
        /// Initiate OAuth flow with GitHub
        /// </summary>
        public async Task<Session> SignInWithGithubAsync(CancellationToken cancellationToken = default)
        {
            return await PerformOAuthFlowAsync(Provider.Github, cancellationToken);
        }

        /// <summary>
        /// Initiate OAuth flow with Discord
        /// </summary>
        public async Task<Session> SignInWithDiscordAsync(CancellationToken cancellationToken = default)
        {
            return await PerformOAuthFlowAsync(Provider.Discord, cancellationToken);
        }

        /// <summary>
        /// Initiate OAuth flow with Twitch
        /// </summary>
        public async Task<Session> SignInWithTwitchAsync(CancellationToken cancellationToken = default)
        {
            return await PerformOAuthFlowAsync(Provider.Twitch, cancellationToken);
        }

        #endregion

        private async Task<Session> PerformOAuthFlowAsync(Provider provider, CancellationToken cancellationToken)
        {
            var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellationToken).Token;

            try
            {
                UnityEngine.Debug.Log($"[SupabaseWebServer] Starting OAuth flow for provider: {provider}");

                // Start the OAuth flow
                var providerAuth = await _supabaseInstance.Client.Auth.SignIn(provider, new SignInOptions
                {
                    FlowType = OAuthFlowType.PKCE,
                    RedirectTo = DefaultRedirectUrl
                });

                if (providerAuth == null)
                    throw new InvalidOperationException("Failed to initiate OAuth flow");

                _pkceVerifier = providerAuth.PKCEVerifier;

                // Open OAuth URL in browser
                UnityEngine.Application.OpenURL(providerAuth.Uri.ToString());
                UnityEngine.Debug.Log($"[SupabaseWebServer] OAuth URL opened for {provider}: {providerAuth.Uri}");

                // Start local webserver and wait for callback
                var authCode = await StartWebServerAndWaitForCallback(linkedToken);

                // Exchange code for session
                var session = await _supabaseInstance.Client.Auth.ExchangeCodeForSession(_pkceVerifier, authCode);

                UnityEngine.Debug.Log($"[SupabaseWebServer] OAuth login successful for user: {session?.User?.Email}");
                return session;
            }
            catch (OperationCanceledException)
            {
                UnityEngine.Debug.Log("[SupabaseWebServer] OAuth flow cancelled");
                throw;
            }
            catch (GotrueException ex)
            {
                UnityEngine.Debug.LogError($"[SupabaseWebServer] OAuth error for {provider}: {ex.Message}");
                throw;
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogError($"[SupabaseWebServer] OAuth exception for {provider}: {ex.Message}");
                throw;
            }
        }

        private async Task<string> StartWebServerAndWaitForCallback(CancellationToken cancellationToken)
        {
            _authCodeTcs = new TaskCompletionSource<string>();

            try
            {
                // Start local HTTP server
                _httpListener = new HttpListener();
                _httpListener.Prefixes.Add(DefaultRedirectUrl);
                _httpListener.Start();

                UnityEngine.Debug.Log($"[SupabaseWebServer] Local webserver started on {DefaultRedirectUrl}");

                // Start listening for requests
                var listenerTask = ProcessHttpRequestsAsync(cancellationToken);

                // Open OAuth URL in browser (this should be handled by the caller in a Unity context)
                // We'll return the auth code when received
                var authCode = await _authCodeTcs.Task;

                return authCode;
            }
            finally
            {
                // Cleanup
                StopWebServer();
            }
        }

        private async Task ProcessHttpRequestsAsync(CancellationToken cancellationToken)
        {
            try
            {
                while (!cancellationToken.IsCancellationRequested && _httpListener.IsListening)
                {
                    var context = await _httpListener.GetContextAsync();
                    ProcessCallback(context);
                }
            }
            catch (ObjectDisposedException)
            {
                // Expected when shutting down
            }
            catch (HttpListenerException ex) when (ex.ErrorCode == 995) // ERROR_OPERATION_ABORTED
            {
                // Expected when shutting down
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogError($"[SupabaseWebServer] Error in HTTP listener: {ex.Message}");
                _authCodeTcs?.TrySetException(ex);
            }
        }

        private void ProcessCallback(HttpListenerContext context)
        {
            try
            {
                UnityEngine.Debug.Log("[SupabaseWebServer] Incoming OAuth callback received");

                var request = context.Request;
                var authCode = request.QueryString.Get("code");

                // Send response to browser
                var response = context.Response;
                const string responseString = "<html><body><b>Authentication successful!</b><br>(You can close this tab/window now)</body></html>";
                var buffer = System.Text.Encoding.UTF8.GetBytes(responseString);

                response.ContentLength64 = buffer.Length;
                response.OutputStream.Write(buffer, 0, buffer.Length);
                response.OutputStream.Close();

                // Complete the auth flow
                if (!string.IsNullOrEmpty(authCode))
                {
                    _authCodeTcs?.TrySetResult(authCode);
                    UnityEngine.Debug.Log("[SupabaseWebServer] OAuth callback processed successfully");
                }
                else
                {
                    var error = request.QueryString.Get("error") ?? "No authorization code received";
                    _authCodeTcs?.TrySetException(new InvalidOperationException($"OAuth callback error: {error}"));
                }
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogError($"[SupabaseWebServer] Error processing OAuth callback: {ex.Message}");
                _authCodeTcs?.TrySetException(ex);
            }
        }

        private void StopWebServer()
        {
            try
            {
                _httpListener?.Stop();
                _httpListener?.Close();
                _httpListener = null;
                UnityEngine.Debug.Log("[SupabaseWebServer] Local webserver stopped");
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogError($"[SupabaseWebServer] Error stopping webserver: {ex.Message}");
            }
        }

        public void Dispose()
        {
            try
            {
                _cts?.Cancel();
                _cts?.Dispose();
                StopWebServer();
                _authCodeTcs?.TrySetCanceled();

                UnityEngine.Debug.Log("[SupabaseWebServer] OAuth service disposed.");
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogError($"[SupabaseWebServer] Error during disposal: {ex}");
            }
        }
    }
}