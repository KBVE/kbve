using System;
using UnityEngine;

namespace KBVE.Events.Network
{
  public static class NetworkEvents
  {
    public static event Action<NetworkResponseEventArgs> OnApiResponseReceived;
    public static event Action<string> OnNetworkError;

    public static void TriggerApiResponseReceived(string data)
    {
      OnApiResponseReceived?.Invoke(new NetworkResponseEventArgs(data));
    }

    public static void TriggerNetworkError(string error)
    {
      OnNetworkError?.Invoke(error);
    }
  }

  public class NetworkResponseEventArgs : EventArgs
  {
    public string ResponseData { get; private set; }

    public NetworkResponseEventArgs(string responseData)
    {
      ResponseData = responseData;
    }
  }
}
