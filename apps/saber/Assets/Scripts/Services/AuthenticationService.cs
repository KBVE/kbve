using System.Collections;
using KBVE.Events.Network;
using UnityEngine;
using UnityEngine.Networking;

public class AuthenticationService : MonoBehaviour, KBVE.Services.Services.ICleanable
{
  [System.Serializable]
  public class LoginResponse
  {
    public Data data;
    public Message message;
  }

  [System.Serializable]
  public class Data
  {
    public string status;
  }

  [System.Serializable]
  public class Message
  {
    public string token;
  }

  private UnityWebRequest currentRequest = null;

  public void Login(string username, string password)
  {
    StartCoroutine(LoginCoroutine("https://rust.kbve.com/api/v1/auth/login", username, password));
  }

  private IEnumerator LoginCoroutine(string url, string username, string password)
  {
    var loginData = new { username = username, password = password };

    string jsonData = JsonUtility.ToJson(loginData);

    currentRequest = new UnityWebRequest(url, "POST");
    byte[] jsonToSend = new System.Text.UTF8Encoding().GetBytes(jsonData);
    currentRequest.uploadHandler = new UploadHandlerRaw(jsonToSend);
    currentRequest.downloadHandler = new DownloadHandlerBuffer();
    currentRequest.SetRequestHeader("Content-Type", "application/json");

    yield return currentRequest.SendWebRequest();

    if (currentRequest.result == UnityWebRequest.Result.Success)
    {
      LoginResponse response = JsonUtility.FromJson<LoginResponse>(
        currentRequest.downloadHandler.text
      );

      if (
        response.data != null
        && response.data.status == "complete"
        && response.message != null
        && !string.IsNullOrEmpty(response.message.token)
      )
      {
        string jwt = response.message.token;
        AuthenticationEvent.TriggerLoginSuccess(jwt);
      }
      else
      {
        AuthenticationEvent.TriggerLoginFailure("Unexpected response format or missing data.");
      }
    }
    else
    {
      AuthenticationEvent.TriggerLoginFailure(currentRequest.error);
    }

    currentRequest = null;
  }

  private void SetupRequest(string username, string password)
  {
    WWWForm form = new WWWForm();
    form.AddField("username", username);
    form.AddField("password", password);
    currentRequest.uploadHandler = new UploadHandlerRaw(form.data);
  }

  public void Cleanup()
  {
    if (currentRequest != null)
    {
      currentRequest.Abort();
      currentRequest = null;
    }
  }
}
