using System;
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
      m_Driver = NetworkDriver.Create(new UDPNetworkInterface());
      var endpoint = NetworkEndPoint.Parse(serverUri, port);
      m_Connection = m_Driver.Connect(endpoint);
      Debug.Log($"UDPTransport: Connecting to {serverUri}:{port}");
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
            Debug.Log("UDPTransport: Connected via UDPT_9a3a12ead28e46b085d6532e02cdac50");
            break;
          case NetworkEvent.Type.Data:
            var buffer = new byte[stream.Length];
            stream.ReadBytesIntoArray(buffer, 0, buffer.Length);
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
