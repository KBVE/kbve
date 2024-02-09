using System;
using System.Collections;
using KBVE.Events.Network;
using UnityEngine;
using UnityEngine.Networking;

namespace KBVE.Services
{
  public interface IAPIRequestService
  {
    IEnumerator SendGetRequest(string url, Action<string> onSuccess, Action<string> onError);
    IEnumerator SendPostRequest(
      string url,
      string jsonData,
      Action<string> onSuccess,
      Action<string> onError
    );
  }

  public class APIRequestService : MonoBehaviour, IAPIRequestService
  {
    private string GetJwtToken()
    {
      var userDataService = Services.Instance.GetService<IUserDataService>();
      return userDataService?.GetToken();
    }

    public IEnumerator SendGetRequest(string url, Action<string> onSuccess, Action<string> onError)
    {
      using (UnityWebRequest webRequest = UnityWebRequest.Get(url))
      {
        // Fetch JWT Bearer token from UserDataService
        string jwtToken = GetJwtToken();
        if (!string.IsNullOrEmpty(jwtToken))
        {
          webRequest.SetRequestHeader("Authorization", $"Bearer {jwtToken}");
        }

        yield return webRequest.SendWebRequest();

        if (webRequest.result == UnityWebRequest.Result.Success)
        {
          onSuccess?.Invoke(webRequest.downloadHandler.text);
          NetworkEvents.TriggerApiResponseReceived(webRequest.downloadHandler.text);
        }
        else
        {
          onError?.Invoke(webRequest.error);
          NetworkEvents.TriggerNetworkError(webRequest.error);
        }
      }
    }

    public IEnumerator SendPostRequest(
      string url,
      string jsonData,
      Action<string> onSuccess,
      Action<string> onError
    )
    {
      using (UnityWebRequest webRequest = new UnityWebRequest(url, "POST"))
      {
        byte[] jsonToSend = new System.Text.UTF8Encoding().GetBytes(jsonData);
        webRequest.uploadHandler = new UploadHandlerRaw(jsonToSend);
        webRequest.downloadHandler = new DownloadHandlerBuffer();
        webRequest.SetRequestHeader("Content-Type", "application/json");

        // Fetch JWT Bearer token from UserDataService
        string jwtToken = GetJwtToken();
        if (!string.IsNullOrEmpty(jwtToken))
        {
          webRequest.SetRequestHeader("Authorization", $"Bearer {jwtToken}");
        }

        yield return webRequest.SendWebRequest();

        if (webRequest.result == UnityWebRequest.Result.Success)
        {
          onSuccess?.Invoke(webRequest.downloadHandler.text);
          NetworkEvents.TriggerApiResponseReceived(webRequest.downloadHandler.text);
        }
        else
        {
          onError?.Invoke(webRequest.error);
          NetworkEvents.TriggerNetworkError(webRequest.error);
        }
      }
    }
  }
}
