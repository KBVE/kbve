using System;
using System.Collections;
using KBVE.Events.Network;
using KBVE.Services;
using UnityEngine;
using UnityEngine.Networking;

namespace KBVE.Services
{
  [System.Serializable]
public class ErrorResponse
{
    public ErrorData data;
    public ErrorMessage message;
}

[System.Serializable]
public class ErrorData
{
    public string status;
}

[System.Serializable]
public class ErrorMessage
{
    public string error;
}

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

  [System.Serializable]
  public class LoginRequest
  {
    public string email;
    public string password;

    public LoginRequest(string email, string password)
    {
      this.email = email;
      this.password = password;
    }
  }

  public interface IAuthenticationService
  {
    void Login(string email, string password);
  }

  public class AuthenticationService : MonoBehaviour, IAuthenticationService, ICleanable
  {
    private UnityWebRequest currentRequest = null;

    public void Login(string email, string password)
    {
      StartCoroutine(LoginCoroutine("https://rust.kbve.com/api/v1/auth/login", email, password));
    }

    private IEnumerator LoginCoroutine(string url, string email, string password)
    {

      LoginRequest loginRequest = new LoginRequest(email, password);
      string jsonData = JsonUtility.ToJson(loginRequest);

      currentRequest = new UnityWebRequest(url, "POST");
      byte[] jsonToSend = new System.Text.UTF8Encoding().GetBytes(jsonData);
      currentRequest.uploadHandler = new UploadHandlerRaw(jsonToSend);
      currentRequest.downloadHandler = new DownloadHandlerBuffer();
      currentRequest.SetRequestHeader("Content-Type", "application/json");

      yield return currentRequest.SendWebRequest();

      if (currentRequest.result == UnityWebRequest.Result.Success)
      {
        try
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
        catch (ArgumentException e)
        {
          Debug.LogError(
            $"JSON parse error: {e.Message}\nReceived JSON: {currentRequest.downloadHandler.text}"
          );
          AuthenticationEvent.TriggerLoginFailure("Error parsing server response.");
        }
      }
      else
      {
        try
    {
        ErrorResponse errorResponse = JsonUtility.FromJson<ErrorResponse>(currentRequest.downloadHandler.text);
        if (errorResponse != null && errorResponse.message != null)
        {
            //Debug.LogError($"Login Failed: {errorResponse.message.error}");
            AuthenticationEvent.TriggerLoginFailure(errorResponse.message.error);
        }
        else
        {
            // Fallback error message if parsing fails or doesn't provide detailed info
            AuthenticationEvent.TriggerLoginFailure("An unknown error occurred.");
        }
    }
    catch (Exception e)
    {
        Debug.LogError($"Exception parsing error response: {e.Message}");
        AuthenticationEvent.TriggerLoginFailure("Error parsing error response.");
    }
      }

      currentRequest = null;
    }

    private void SetupRequest(string email, string password)
    {
      WWWForm form = new WWWForm();
      form.AddField("email", email);
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
}
