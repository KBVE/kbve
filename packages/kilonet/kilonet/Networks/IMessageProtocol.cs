using System;

namespace KBVE.Kilonet.Network
{
    public interface IMessageProtocol
    {
        byte[] Serialize<T>(T message);
        T Deserialize<T>(byte[] data);
        string ContentType { get; }
    }
}