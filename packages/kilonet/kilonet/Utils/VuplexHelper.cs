using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using Supabase;
using Supabase.Gotrue;
using UnityEngine;
using Vuplex.WebView;

namespace KBVE.Kilonet.Utils
{
  public class VuplexHelper : MonoBehaviour
  {
    public string CanvasObjectName = "Canvas";
    public string CanvasWebViewPrefabName = "CanvasWebViewPrefab";
    public string CanvasWebViewPrefabViewName = "CanvasWebViewPrefabView";

    private CanvasWebViewPrefab _canvasWebViewPrefab;

    private Supabase.Client _supabaseClient;

    private const string SUPABASE_URL = "https://supabase.kbve.com";
    private const string SUPABASE_ANON_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg";

    private void Start()
    {
      try
      {
        // Use UniTask to manage initialization
        InitializeWebView().Forget(); // Use UniTask's Forget to run async without awaiting
        
        InitializeSupabaseClientAsync().Forget(); // Initialize Supabase client asynchronously
      }
      catch (Exception ex)
      {
        Debug.LogError($"Vuplex CanvasWebView initialization failed: {ex.Message}");
      }
    }


    private async UniTaskVoid InitializeWebView()
    {
      GameObject canvasObject = GameObject.Find(CanvasObjectName);
      if (canvasObject == null)
      {
        Debug.LogError($"No GameObject found with the name {CanvasObjectName}");
        return;
      }

      Transform canvasWebViewPrefabTransform = canvasObject.transform.Find(CanvasWebViewPrefabName);
      if (canvasWebViewPrefabTransform == null)
      {
        Debug.LogError(
          $"No GameObject found with the name {CanvasWebViewPrefabName} under {CanvasObjectName}."
        );
        return;
      }

      Transform canvasWebViewPrefabViewTransform = canvasWebViewPrefabTransform.Find(
        CanvasWebViewPrefabViewName
      );
      if (canvasWebViewPrefabViewTransform == null)
      {
        Debug.LogError(
          $"No GameObject found with the name {CanvasWebViewPrefabViewName} under {CanvasWebViewPrefabName}."
        );
        return;
      }

      _canvasWebViewPrefab = canvasWebViewPrefabViewTransform.GetComponent<CanvasWebViewPrefab>();
      if (_canvasWebViewPrefab == null)
      {
        _canvasWebViewPrefab = canvasWebViewPrefabTransform.GetComponent<CanvasWebViewPrefab>();

        if (_canvasWebViewPrefab == null)
        {
          Debug.LogError(
            "Failed to locate the CanvasWebViewPrefab component after multiple attempts."
          );
          return;
        }
      }

      await _canvasWebViewPrefab.WaitUntilInitialized();

      _canvasWebViewPrefab.WebView.MessageEmitted += OnMessageReceived;
      Debug.Log("Vuplex CanvasWebView successfully initialized and ready to receive messages.");
    }

    private async UniTaskVoid InitializeSupabaseClientAsync()
    {
      try
      {
        var options = new SupabaseOptions { AutoRefreshToken = true, AutoConnectRealtime = false, };

        _supabaseClient = new Supabase.Client(SUPABASE_URL, SUPABASE_ANON_KEY, options);
        await _supabaseClient.InitializeAsync(); // Await the initialization instead of using .Wait()

        Debug.Log("Supabase client initialized successfully.");
      }
      catch (Exception ex)
      {
        Debug.LogError($"Supabase client initialization failed: {ex.Message}");
      }
    }

    private void OnMessageReceived(object sender, EventArgs<string> eventArgs)
    {
      try
      {
        Debug.Log("Raw JSON received: " + eventArgs.Value);

        // Parse JSON message
        var dict = JEDI.ParseMiniJSON(eventArgs.Value) as Dictionary<string, object>;
        if (dict == null)
        {
          Debug.LogError("Failed to parse JSON into dictionary. Check JSON format.");
          return;
        }

        // Check if the type field is present and matches "sessionUpdate"
        if (dict.TryGetValue("type", out var type) && type.ToString() == "sessionUpdate")
        {
          Debug.Log("Session update message received.");

          if (dict.TryGetValue("data", out var data) && data is Dictionary<string, object> dataDict)
          {
            if (
              dataDict.TryGetValue("session", out var sessionData)
              && sessionData is Dictionary<string, object> sessionDict
            )
            {
              Debug.Log("Session data successfully parsed.");

              // Extract necessary fields from the session dictionary
              if (
                sessionDict.TryGetValue("access_token", out var accessToken)
                && sessionDict.TryGetValue("refresh_token", out var refreshToken)
              )
              {
                // Use the SetSession method to establish the session using the access and refresh tokens
                _supabaseClient
                  .Auth
                  .SetSession(accessToken.ToString(), refreshToken.ToString())
                  .ContinueWith(task =>
                  {
                    if (task.IsCompletedSuccessfully)
                    {
                      Debug.Log("Supabase session updated successfully using SetSession.");
                      var currentSession = _supabaseClient.Auth.CurrentSession;
                      if (currentSession != null)
                      {
                        Debug.Log($"Current Session Access Token: {currentSession.AccessToken}");
                        Debug.Log($"Current Session Refresh Token: {currentSession.RefreshToken}");
                        Debug.Log($"Session Expiration: {currentSession.ExpiresIn}");

                        var currentUser = _supabaseClient.Auth.CurrentUser;
                        if (currentUser != null)
                        {
                          Debug.Log($"Current User ID: {currentUser.Id}");
                          Debug.Log($"Current User Email: {currentUser.Email}");
                        }
                        else
                        {
                          Debug.LogWarning("Current User is null.");
                        }
                      }
                      else
                      {
                        Debug.LogWarning("Current Session is null.");
                      }
                    }
                    else
                    {
                      Debug.LogError($"Failed to set session: {task.Exception?.Message}");
                    }
                  });
              }
            }
          }
        }
        else
        {
          Debug.LogWarning($"Message type is not 'sessionUpdate'. Received type: {type}");
        }
      }
      catch (Exception ex)
      {
        Debug.LogError($"Exception occurred while processing the message: {ex.Message}");
      }
    }

    private string GetFullPath(GameObject gameObject)
    {
      string path = gameObject.name;
      while (gameObject.transform.parent != null)
      {
        gameObject = gameObject.transform.parent.gameObject;
        path = gameObject.name + "/" + path;
      }
      return path;
    }

    [Serializable]
    public class WebViewMessage
    {
      public string type; // Ensure this matches the exact JSON key (lowercase "type")
      public WebViewData data; // Ensure this matches the exact JSON key (lowercase "data")
      public string message; // Add this field if needed
    }

    [Serializable]
    public class WebViewData
    {
      public Supabase.Gotrue.Session session; // Matches "session" field in JSON
      public Supabase.Gotrue.User user; // Matches "user" field in JSON
    }
  }
}
