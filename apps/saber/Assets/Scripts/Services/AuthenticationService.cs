using UnityEngine;
using System.Collections;
using UnityEngine.Networking;
using KBVE.Events.Network;

public class AuthenticationService : MonoBehaviour, KBVE.Services.Services.ICleanable
{
    private readonly string loginUrl = "https://yourapi.com/login";

    public void Login(string username, string password)
    {
        StartCoroutine(LoginCoroutine(username, password));
    }

    private IEnumerator LoginCoroutine(string username, string password)
    {
        WWWForm form = new WWWForm();
        form.AddField("username", username);
        form.AddField("password", password);

        using (UnityWebRequest webRequest = UnityWebRequest.Post(loginUrl, form))
        {
            yield return webRequest.SendWebRequest();

            if (webRequest.result == UnityWebRequest.Result.Success)
            {
                string jwt = webRequest.downloadHandler.text;
                AuthenticationEvent.TriggerLoginSuccess(jwt);
            }
            else
            {
                AuthenticationEvent.TriggerLoginFailure(webRequest.error);
            }
        }
    }

    public void Cleanup()
    {
    }
}
