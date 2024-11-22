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

    [SerializeField]
    private string serverUri = "wss://server.rareicon.com";

    [SerializeField]
    private ushort serverPort = 443;

    //  Action Hooks
    public Action OnConnected;
    public Action OnDisconnected;
    public Action<byte[]> OnMessageReceived;
    public Action<Stream> OnStreamReceived;

    private void Start()
    {
      InitializeTransport();
      Connect();
    }

    private void Update()
    {
      activeTransport?.Update();
    }

    private void OnDestroy()
    {
      Disconnect();
    }

    private void InitializeTransport()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      Debug.Log("NetworkManager: Initializing WebSocket transport for WebGL...");
      activeTransport = new WebSocketTransport();
#else
      Debug.Log("NetworkManager: Initializing UDP transport for non-WebGL...");
      activeTransport = new UDPTransport();
#endif

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
      Debug.Log("NetworkManager: Disconnected.");
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
