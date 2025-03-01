using System;
using System.Text;
using UnityEngine;

namespace KBVE.Kilonet.Networks
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

    /// <summary>
    /// Parses a JSON message and extracts the JavaScriptMessageType.
    /// </summary>
    /// <param name="message">The JSON message string.</param>
    /// <returns>The parsed JavaScriptMessageType.</returns>
    public JavaScriptMessageType ParseMessageType(string message)
    {
      if (string.IsNullOrEmpty(message))
      {
        Debug.LogError("ParseMessageType: Message is null or empty.");
        return JavaScriptMessageType.None;
      }

      try
      {
        byte[] data = Encoding.UTF8.GetBytes(message);
        JavaScriptMessage parsedMessage = Deserialize<JavaScriptMessage>(data);
        if (Enum.TryParse(parsedMessage.type, true, out JavaScriptMessageType messageType))
        {
          return messageType;
        }
        else
        {
          Debug.LogWarning($"ParseMessageType: Unknown message type '{parsedMessage.type}'.");
          return JavaScriptMessageType.None;
        }
      }
      catch (Exception ex)
      {
        Debug.LogError($"ParseMessageType: Failed to parse message. Error: {ex.Message}");
        return JavaScriptMessageType.Error;
      }
    }
  }

  /// <summary>
  /// Represents a structured JavaScript message for deserialization.
  /// </summary>
  [Serializable]
  public class JavaScriptMessage
  {
    public string type; // The message type as a string (e.g., "Event", "Error", etc.)
    public string payload; // The actual data or payload of the message
  }
}
