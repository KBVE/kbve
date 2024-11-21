using System;

namespace KBVE.Kilonet.Network
{
    public interface IMessageProtocol
    {
        byte[] Serialize<T>(T message);
        T Desrialize<T>(byte[] data);
        string ContentType { get; }
    }
}