using System;
using System.Collections.Generic;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace KBVE.Kilonet.Networks
{
  [Flags]
  public enum JavaScriptListenerState
  {
    None = 0, // No state (default)
    Initializing = 1 << 0, // 00000000000000000000000000000001 - Listener is setting up
    WaitingForServer = 1 << 1, // 00000000000000000000000000000010 - Waiting for WebSocket or server configuration
    Connected = 1 << 2, // 00000000000000000000000000000100 - Listener is active and connected
    Disconnected = 1 << 3, // 00000000000000000000000000001000 - Listener is disconnected
    Error = 1 << 4, // 00000000000000000000000000010000 - Listener encountered an error
    Reconnecting = 1 << 5, // 00000000000000000000000000100000 - Listener is attempting to reconnect
    Listening = 1 << 6, // 00000000000000000000000001000000 - Listener is actively receiving data
    Paused = 1 << 7, // 00000000000000000000000010000000 - Listener is paused
    Closing = 1 << 8, // 00000000000000000000000100000000 - Listener is shutting down
    Retrying = 1 << 9, // 00000000000000000000001000000000 - Listener is retrying a failed operation
    Suspended = 1 << 10, // 00000000000000000000010000000000 - Listener is suspended
    Authenticated = 1 << 11, // 00000000000000000000100000000000 - Listener completed authentication
    Unsubscribed = 1 << 12, // 00000000000000000001000000000000 - Listener is unsubscribed
    PendingData = 1 << 13, // 00000000000000000010000000000000 - Pending data to process
    Timeout = 1 << 14, // 00000000000000000100000000000000 - Operation timeout
    ReceivingHandshake = 1 << 15, // 00000000000000001000000000000000 - Receiving initial handshake
    HeartbeatFailure = 1 << 16, // 00000000000000010000000000000000 - Heartbeat failure
    Resuming = 1 << 17, // 00000000000000100000000000000000 - Listener resuming
    RateLimited = 1 << 18, // 00000000000001000000000000000000 - Listener is rate-limited
    Buffered = 1 << 19, // 00000000000010000000000000000000 - Data is buffered
    WaitingForReconnect = 1 << 20, // 00000000000100000000000000000000 - Waiting for reconnect attempt
    SendingData = 1 << 21, // 00000000001000000000000000000000 - Listener is sending data
    ReceivingData = 1 << 22, // 00000000010000000000000000000000 - Listener is receiving data
    Overloaded = 1 << 23, // 00000000100000000000000000000000 - Listener is overloaded with requests
    Validating = 1 << 24, // 00000001000000000000000000000000 - Listener is validating data
    Queued = 1 << 25, // 00000010000000000000000000000000 - Listener's actions are queued
    Syncing = 1 << 26, // 00000100000000000000000000000000 - Listener is synchronizing data
    Expired = 1 << 27, // 00001000000000000000000000000000 - Listener session expired
    Degraded = 1 << 28, // 00010000000000000000000000000000 - Listener is in a degraded state
    ShuttingDown = 1 << 29, // 00100000000000000000000000000000 - Listener is shutting down completely
    MaintenanceMode = 1 << 30, // 01000000000000000000000000000000 - Listener in maintenance mode
    CriticalFailure = 1 << 31 // 10000000000000000000000000000000 - Listener encountered a critical failure
  }

  [Flags]
  public enum JavaScriptMessageType
  {
    None = 0, // 0000000 - No type
    Text = 1 << 0, // 0000001 - Plain text
    JSON = 1 << 1, // 0000010 - JSON data
    Binary = 1 << 2, // 0000100 - Binary data
    Command = 1 << 3, // 0001000 - Command or action message
    Event = 1 << 4, // 0010000 - Real-time event
    Error = 1 << 5, // 0100000 - Error message
    Notification = 1 << 6, // 1000000 - Notification message
    Authentication = 1 << 7,
    Configuration = 1 << 8,
    Sync = 1 << 9,
    Heartbeat = 1 << 10,
    Purge = 1 << 11
  }

  public class JavascriptFFI : MonoBehaviour
  {
#if UNITY_WEBGL && !UNITY_EDITOR

    [DllImport("__Internal")]
    private static extern void InitializeIFrameBridge();

    [DllImport("__Internal")]
    private static extern void RequestSetActivity(string activity);

    [DllImport("__Internal")]
    private static extern void RequestInstanceId();

    [DllImport("__Internal")]
    private static extern void RequestChannelId();

    [DllImport("__Internal")]
    private static extern void RequestGuildId();

    [DllImport("__Internal")]
    private static extern void RequestUserId();

    [DllImport("__Internal")]
    private static extern void RequestUser();

    [DllImport("__Internal")]
    private static extern void RequestInstanceParticipants();

    [DllImport("__Internal")]
    private static extern void RequestHardwareAcceleration();

    [DllImport("__Internal")]
    private static extern void RequestChannel(string channelId);

    [DllImport("__Internal")]
    private static extern void RequestChannelPermissions(string channelId);

    [DllImport("__Internal")]
    private static extern void RequestEntitlements();

    [DllImport("__Internal")]
    private static extern void RequestPlatformBehaviors();

    [DllImport("__Internal")]
    private static extern void RequestSkus();

    [DllImport("__Internal")]
    private static extern void RequestImageUpload();

    [DllImport("__Internal")]
    private static extern void RequestOpenExternalLink(string url);

    [DllImport("__Internal")]
    private static extern void RequestInviteDialog();

    [DllImport("__Internal")]
    private static extern void RequestShareMomentDialog(string mediaUrl);

    [DllImport("__Internal")]
    private static extern void RequestSetOrientationLockState(
      int lockState,
      string pictureInPictureLockState,
      string gridLockState
    );

    [DllImport("__Internal")]
    private static extern void RequestPurchase();

    [DllImport("__Internal")]
    private static extern void RequestLocale();

    [DllImport("__Internal")]
    private static extern void RequestSetConfig(bool useInteractivePip);

    [DllImport("__Internal")]
    private static extern void PingLoad();

    [DllImport("__Internal")]
    private static extern void Subscribe(string eventName);

    [DllImport("__Internal")]
    private static extern void Unsubscribe(string eventName);

    [DllImport("__Internal")]
    private static extern void SendMessageToBrowser(string method, string parameter);
#endif

    private static readonly Dictionary<string, Action<string>> EventHandlers = new();
    public static Action<string> OnJavaScriptMessageReceived;

    private void Start()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      Debug.Log("JavaScriptBridge: Initializing IFrame Bridge...");
      InitializeIFrameBridge();
#endif
    }

    public static void InitializeBridge()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      InitializeIFrameBridge();
      Debug.Log("IFrame Bridge Initialized");
#else
      Debug.LogWarning("Bridge initialization is mocked in non-WebGL builds.");
#endif
    }

    public static void SubscribeToEvent(string eventName, Action<string> callback)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      if (!EventHandlers.ContainsKey(eventName))
      {
        EventHandlers[eventName] = callback;
        Subscribe(eventName);
      }
      else
      {
        Debug.LogWarning($"Event {eventName} is already subscribed.");
      }
#else
      Debug.LogWarning($"Mocked SubscribeToEvent: {eventName}");
#endif
    }

    public static void UnsubscribeFromEvent(string eventName)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      if (EventHandlers.ContainsKey(eventName))
      {
        EventHandlers.Remove(eventName);
        Unsubscribe(eventName);
      }
      else
      {
        Debug.LogWarning($"Event {eventName} is not subscribed.");
      }
#else
      Debug.LogWarning($"Mocked UnsubscribeFromEvent: {eventName}");
#endif
    }

    public static void SetActivity(string activityJson)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      RequestSetActivity(activityJson);
#else
      Debug.LogWarning($"Mocked SetActivity: {activityJson}");
#endif
    }

    public static void InvokeRequestUserId()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      RequestUserId();
#else
      Debug.LogWarning("Mocked InvokeRequestUserId");
#endif
    }

    public static void RequestLocale()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      RequestLocale();
#else
      Debug.LogWarning("Mocked RequestLocale");
#endif
    }

    public void HandleJavaScriptMessage(string message)
    {
      Debug.Log($"JavaScriptBridge: Message received: {message}");
      OnJavaScriptMessageReceived?.Invoke(message);
    }

    public static void SendMessageToJavaScript(string method, string parameter)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      try
      {
        Debug.Log($"Sending message to JavaScript: {method}({parameter})");
        SendMessageToBrowser(method, parameter);
      }
      catch
      {
        Debug.LogError(
          "Failed to send message to JavaScript. Ensure the WebGL environment is set up."
        );
      }
#else
      Debug.Log($"Mocked SendMessageToJavaScript: {method}({parameter})");
#endif
    }
  }
}
