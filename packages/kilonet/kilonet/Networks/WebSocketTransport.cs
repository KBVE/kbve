using System;
using System.IO;
using KBVE.Kilonet.Utils;
using Unity.Collections;
using Unity.Networking.Transport;
using UnityEngine;

namespace KBVE.Kilonet.Networks
{
  public class WebSocketTransport : INetworkTransport
  {
    private NetworkDriver m_Driver;
    private NetworkConnection m_Connection;

    public void Connect(string serverUri, ushort port)
    {
      m_Driver = NetworkDriver.Create(new WebSocketNetworkInterface());
      var endpoint = NetworkEndPoint.Parse(serverUri, port);
      m_Connection = m_Driver.Connect(endpoint);
      Debug.Log($"WebSocketTransport: Connecting to {serverUri}:{port}");
    }

    public void Send(byte[] data)
    {
      if (!m_Connection.IsCreated)
        return;

      DataStreamWriter writer;
      if (m_Driver.BeginSend(NetworkPipeline.Null, m_Connection, out writer) == 0)
      {
        writer.WriteBytes(data);
        m_Driver.EndSend(writer);
      }
      else
      {
        Debug.LogWarning("WebSocketTransport: Failed to begin send operation.");
      }
    }

    public void Send(Stream dataStream)
    {
      if (!m_Connection.IsCreated)
        return;

      DataStreamWriter writer;
      if (m_Driver.BeginSend(NetworkPipeline.Null, m_Connection, out writer) == 0)
      {
        using (var memoryStream = new MemoryStream())
        {
          dataStream.CopyTo(memoryStream);
          byte[] data = memoryStream.ToArray();

          writer.WriteBytes(data);
        }

        m_Driver.EndSend(writer);
      }
      else
      {
        Debug.LogWarning("WebSocketTransport: Failed to begin send operation.");
      }
    }

    public void Update()
    {
      m_Driver.ScheduleUpdate().Complete();

      DataStreamReader stream;
      NetworkEvent.Type eventType;

      while ((eventType = m_Connection.PopEvent(m_Driver, out stream)) != NetworkEvent.Type.Empty)
      {
        switch (eventType)
        {
          case NetworkEvent.Type.Connect:
            Debug.Log("WebSocketTransport: Connected!");
            break;
          case NetworkEvent.Type.Data:
            var buffer = BytesUtils.ReadAllBytes(stream);
            onReceive?.Invoke(buffer);

            if (onReceiveStream != null)
            {
              using (var memoryStream = new MemoryStream(buffer))
              {
                onReceiveStream(memoryStream);
              }
            }

            Debug.Log($"WebSocketTransport: Received {buffer.Length} bytes");
            break;
          case NetworkEvent.Type.Disconnect:
            Debug.Log("WebSocketTransport: Disconnected.");
            break;
        }
      }
    }

    public void Disconnect()
    {
      if (m_Connection.IsCreated)
      {
        m_Connection.Disconnect(m_Driver);
      }

      m_Driver.Dispose();
    }

    private Action<byte[]> onReceive;

    public void Receive(Action<byte[]> onReceive)
    {
      this.onReceive = onReceive;
    }

    private Action<Stream> onReceiveStream;

    public void Receive(Action<Stream> onReceiveStream)
    {
      this.onReceiveStream = onReceiveStream;
    }
  }
}
