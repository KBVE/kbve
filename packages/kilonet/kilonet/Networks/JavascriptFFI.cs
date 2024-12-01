using System;
using System.Runtime.InteropServices;
using UnityEngine;

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
    None = 0,          // 0000000 - No type
    Text = 1 << 0,     // 0000001 - Plain text
    JSON = 1 << 1,     // 0000010 - JSON data
    Binary = 1 << 2,   // 0000100 - Binary data
    Command = 1 << 3,  // 0001000 - Command or action message
    Event = 1 << 4,    // 0010000 - Real-time event
    Error = 1 << 5,    // 0100000 - Error message
    Notification = 1 << 6 // 1000000 - Notification message
  }


  public class JavascriptFFI : MonoBehaviour
  {
    [DllImport("__Internal")]
    private static extern void ListenForJavaScriptMessages();

    [DllImport("__Internal")]
    private static extern void SendMessageToUnity(string message);

    public static Action<string> OnJavaScriptMessageReceived;
    public static Action<object> OnJsonReceived;

    private void Start()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      Debug.Log("JavaScriptBridge: Starting JavaScript listener...");
      ListenForJavaScriptMessages();
#endif
    }

    // Called by JavaScript
    public void HandleJavaScriptMessage(string message)
    {
      Debug.Log($"JavaScriptBridge: Message received: {message}");
      OnMessageReceived?.Invoke(message);
    }

    public static void SendMessageToJavaScript(string method, string parameter)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      Application.ExternalCall(method, parameter);
#endif
    }
  }
}
