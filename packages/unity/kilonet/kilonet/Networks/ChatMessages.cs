using System;

namespace KBVE.Kilonet.Networks
{
  [Serializable]
  public class ChatMessage
  {
    public string SenderId { get; set; }
    public string RecipientId { get; set; }
    public string Content { get; set; }
  }
}
