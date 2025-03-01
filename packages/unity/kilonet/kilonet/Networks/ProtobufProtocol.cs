using System;
using System.IO;
using ProtoBuf;
using ProtoBuf.Meta;

namespace KBVE.Kilonet.Networks
{
    public class ProtobufProtocol : IMessageProtocol
    {
        public string ContentType => "application/protobuf";

        public RuntimeTypeModel Model { get; private set; }

        public ProtobufProtocol()
        {
            Model = RuntimeTypeModel.Default;
        }

        public byte[] Serialize<T>(T message)
        {
            if (message == null)
                throw new ArgumentNullException(nameof(message));

            try
            {
                using (var memoryStream = new MemoryStream())
                {
                    // Serializer.Serialize(memoryStream, message);
                    Model.Serialize(memoryStream, message); 
                    return memoryStream.ToArray();
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to serialize message of type {typeof(T).Name}: {ex.Message}", ex);
            }
        }

        public T Deserialize<T>(byte[] data)
        {
            if (data == null || data.Length == 0)
                throw new ArgumentNullException(nameof(data));

            try
            {
                using (var memoryStream = new MemoryStream(data))
                {
                    return (T)Model.Deserialize(memoryStream, null, typeof(T));
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to deserialize message to type {typeof(T).Name}: {ex.Message}", ex);
            }
        }

        public void RegisterType<T>(Action<MetaType> configure = null)
        {
            var metaType = Model.Add(typeof(T), false);
            configure?.Invoke(metaType);
        }

    }
}
