using System;
using System.IO;
using KBVE.Kilonet.Utils;
using Unity.Collections;
using Unity.Networking.Transport;
using UnityEngine;

namespace KBVE.Kilonet.Networks
{
  public class UDPTransport : INetworkTransport
  {
    private NetworkDriver m_Driver;
    private NetworkConnection m_Connection;

    public void Connect(string serverUri, ushort port)
    {
      //m_Driver = NetworkDriver.Create(new UDPNetworkInterface());
      m_Driver = NetworkDriver.Create();
      var endpoint = NetworkEndPoint.Parse(serverUri, port);
      m_Connection = m_Driver.Connect(endpoint);
      Debug.Log($"UDPTransport: Connecting to {serverUri}:{port}");
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
        Debug.LogWarning("UDPTransport: Failed to begin send operation.");
      }
    }

    public void Send(Stream dataStream)
    {
      if (!m_Connection.IsCreated)
        return;

      DataStreamWriter writer;
      if (m_Driver.BeginSend(NetworkPipeline.Null, m_Connection, out writer) == 0)
      {
        byte[] buffer = new byte[dataStream.Length];
        dataStream.Read(buffer, 0, buffer.Length);
        writer.WriteBytes(buffer);
        m_Driver.EndSend(writer);
      }
      else
      {
        Debug.LogWarning("UDPTransport: Failed to begin send operation.");
      }
    }

    public void Receive(Action<byte[]> callback)
    {
      m_Driver.ScheduleUpdate().Complete();
      DataStreamReader stream;
      while (m_Connection.PopEvent(m_Driver, out stream) != NetworkEvent.Type.Empty)
      {
        if (stream.EventType == NetworkEvent.Type.Data)
        {
          var buffer = BytesUtils.ReadAllBytes(stream);
          callback?.Invoke(buffer);
        }
      }
    }

    public void Receive(Action<Stream> callback)
    {
      m_Driver.ScheduleUpdate().Complete();
      DataStreamReader stream;
      while (m_Connection.PopEvent(m_Driver, out stream) != NetworkEvent.Type.Empty)
      {
        if (stream.EventType == NetworkEvent.Type.Data)
        {
          var buffer = BytesUtils.ReadAllBytes(stream);

          using (var memoryStream = new MemoryStream(buffer))
          {
            callback?.Invoke(memoryStream);
          }
        }
      }
    }

    public void Update()
    {
      m_Driver.ScheduleUpdate().Complete();
      DataStreamReader stream;
      while (m_Connection.PopEvent(m_Driver, out stream) != NetworkEvent.Type.Empty)
      {
        switch (stream.EventType)
        {
          case NetworkEvent.Type.Connect:
            Debug.Log("UDPTransport: Connected via UDPT_9a3a12ead28e46b085d6532e02cdac50");
            break;
          case NetworkEvent.Type.Data:
            var buffer = BytesUtils.ReadAllBytes(stream);
            Debug.Log($"UDPTransport: Received {buffer.Length} bytes");
            break;
          case NetworkEvent.Type.Disconnect:
            Debug.Log("UDPTransport: Disconnected.");
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
  }
}
