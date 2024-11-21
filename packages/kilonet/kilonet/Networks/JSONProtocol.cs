using System;
using System.Text;
using UnityEngine;

namespace KBVE.Kilonet.Network
{
    public class JSONProtocol : IMessageProtocol
    {
        public string ContentType => "application/json";

        public byte[] Serialize<T>(T message)
        {
            if (message == null)
                throw new ArgumentNullException(nameof(message));

            string json = JsonUtility.ToJson(message);
            return Encoding.UTF8.GetBytes(json);
        }

        public T Deserialize<T>(byte[] data)
        {
            if (data == null || data.Length == 0)
                throw new ArgumentNullException(nameof(data));

            string json = Encoding.UTF8.GetString(data);
            return JsonUtility.FromJson<T>(json);
        }
    }
}
