using System;
using Unity.Networking.Transport;
//using System.IO;
//using WebSocketSharp;
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

      using (var writer = m_Driver.BeginSend(m_Connection))
      {
        writer.WriteBytes(data);
        m_Driver.EndSend(writer);
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
            Debug.Log("WebSocketTransport: Connected!");
            break;
          case NetworkEvent.Type.Data:
            var buffer = new byte[stream.Length];
            stream.ReadBytesIntoArray(buffer, 0, buffer.Length);
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
  }
}
