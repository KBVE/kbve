using System;
using System.IO;
using KBVE.Kilonet.Events;
using KBVE.Kilonet.Networks;
using UnityEngine;

namespace KBVE.Kilonet.Managers
{
  public class NetworkManager : MonoBehaviour
  {
    private INetworkTransport activeTransport;
    private ConnectionProfile activeProfile;

    //  Action Hooks
    public Action OnConnected;
    public Action OnDisconnected;
    public Action<byte[]> OnMessageReceived;
    public Action<Stream> OnStreamReceived;

    private void Start()
    {
      try
      {
        var profile = GetDefaultProfile();
        InitializeTransport(profile);
        Connect();
      }
      catch (Exception ex)
      {
        Debug.LogError($"Failed to initialize transport: {ex.Message}");
      }
    }

    private void Update()
    {
      activeTransport?.Update();
    }

    private void OnDestroy()
    {
      Disconnect();
    }

    private ConnectionProfile GetDefaultProfile()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      Debug.Log("Selecting WebSocket profile for WebGL build...");
      var profile = NetworkManagerHelper.GetProfile("DefaultWebGLServer");
#else
      Debug.Log("Selecting UDP profile for non-WebGL build...");
      var profile = NetworkManagerHelper.GetProfile("DefaultUDPServer");
#endif
      if (profile == null)
      {
        throw new InvalidOperationException("Default profile is not configured properly.");
      }
      return profile;
    }

    public void InitializeTransport(ConnectionProfile profile)
    {
      if (profile == null)
      {
        throw new ArgumentNullException(nameof(profile), "Connection profile cannot be null.");
      }

      Debug.Log($"Initializing transport for profile: {profile.Name}");
      switch (profile.TransportType)
      {
        case NetworkManagerHelper.TransportType.WebSocket:
        case NetworkManagerHelper.TransportType.SecureWebSocket:
          Debug.Log("NetworkManager: Initializing WebSocket transport...");
          activeTransport = new WebSocketTransport();
          break;

        case NetworkManagerHelper.TransportType.UDP:
        case NetworkManagerHelper.TransportType.SecureUDP:
          Debug.Log("NetworkManager: Initializing UDP transport...");
          activeTransport = new UDPTransport();
          break;

        default:
          throw new InvalidOperationException(
            $"Unsupported transport type: {profile.TransportType}"
          );
      }

      activeTransport.Receive((Action<byte[]>)OnDataReceived);
      activeTransport.Receive((Action<Stream>)OnDataReceived);
    }

    public void Connect()
    {
      if (activeTransport == null)
      {
        Debug.LogError("NetworkManager: Transport is not initialized.");
        return;
      }

      activeTransport.Connect(serverUri, serverPort);
      Debug.Log("NetworkManager: Connection initiated.");
      OnConnected?.Invoke();
    }

    public void Disconnect()
    {
      if (activeTransport == null)
      {
        Debug.LogWarning("NetworkManager: No active transport to disconnect.");
        return;
      }

      activeTransport.Disconnect();
      Debug.Log($"NetworkManager: Disconnected from {activeProfile.Uri}:{activeProfile.Port}");
      activeTransport = null;
      OnDisconnected?.Invoke();
    }

    public void Send(byte[] data)
    {
      if (activeTransport == null)
      {
        Debug.LogError("NetworkManager: No active transport to send data.");
        return;
      }

      activeTransport.Send(data);
    }

    public void Send(Stream dataStream)
    {
      if (activeTransport == null)
      {
        Debug.LogError("NetworkManager: No active transport to send stream data.");
        return;
      }

      activeTransport.Send(dataStream);
    }

    private void OnDataReceived(byte[] data)
    {
      Debug.Log($"NetworkManager: Data received ({data.Length} bytes)");
      OnMessageReceived?.Invoke(data);
    }

    private void OnDataReceived(Stream dataStream)
    {
      using (var memoryStream = new MemoryStream())
      {
        dataStream.CopyTo(memoryStream);
        var data = memoryStream.ToArray();
        Debug.Log($"NetworkManager: Stream data received ({data.Length} bytes)");
        OnStreamReceived?.Invoke(memoryStream);
      }
    }
  }
}
