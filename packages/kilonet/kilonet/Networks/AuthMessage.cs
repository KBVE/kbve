using System;

namespace KBVE.Kilonet.Networks
{
  [Serializable]
  public class AuthMessage
  {
    public string BearerToken { get; set; }
    public string RoomId { get; set; }
  }
}
