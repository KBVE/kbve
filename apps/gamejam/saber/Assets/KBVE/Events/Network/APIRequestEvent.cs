using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using KBVE.Events.Network;


public class APIRequestEvent : MonoBehaviour
{
  public IEnumerator SendAPIRequest(string url)
  {
    using (UnityWebRequest webRequest = UnityWebRequest.Get(url))
    {
      yield return webRequest.SendWebRequest();

      if (webRequest.result == UnityWebRequest.Result.Success)
      {
        NetworkEvents.TriggerApiResponseReceived(webRequest.downloadHandler.text);
      }
      else
      {
        NetworkEvents.TriggerNetworkError(webRequest.error);
      }
    }
  }
}
