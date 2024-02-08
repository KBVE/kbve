using KBVE.Events.Network;
using KBVE.Services;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace KBVE.ClientUI
{
  public class CharacterForm : MonoBehaviour
  {

    public TMP_Text statusMessage;

    void OnEnable()
    {
      NetworkEvents.OnApiResponseReceived += HandleApiResponseReceived;
      NetworkEvents.OnNetworkError += HandleNetworkError;
    }

    void OnDisable()
    {
      NetworkEvents.OnApiResponseReceived -= HandleApiResponseReceived;
      NetworkEvents.OnNetworkError -= HandleNetworkError;
    }

    private void HandleApiResponseReceived(NetworkResponseEventArgs args)
    {
      // Process API response data
      Debug.Log($"API Response: {args.ResponseData}");
    }

    private void HandleNetworkError(string error)
    {
      // Handle API error
      Debug.LogError($"Network Error: {error}");
    }
  }
}
