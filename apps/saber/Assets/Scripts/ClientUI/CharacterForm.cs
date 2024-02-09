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
    public Button playButton;

    private IAPIRequestService _apiService;

    // TODO private IUserDataService _userDataService;

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
      if (statusMessage != null)
      {
        statusMessage.text = "Networking Error! from CharacterForm";
      }
    }

    private void Start()
    {
      _apiService = Services.Services.Instance.GetService<IAPIRequestService>();

      if (statusMessage == null)
      {
        Debug.LogError("Status Message Element is null - Lite Debug Error");
        return;
      }

      if (_apiService == null)
      {
        statusMessage.text = "API Service has an error from CharacterForm";
        Debug.LogError("Failed to retrieve API Service.");
        return;
      }

      if (playButton != null)
      {
        playButton.onClick.AddListener(OnPlayClicked);
      }
    }

    private void OnPlayClicked()
    {
      Debug.Log("Play button clicked.");
      DemoSendCharacterRequest();
    }

    private void DemoSendCharacterRequest()
    {
      string api_character_url = "https://rust.kbve.com/api/v1/auth/characters";

      StartCoroutine(
        _apiService.SendGetRequest(
          api_character_url,
          response =>
          {
            CharacterResponse characterResponse = JsonUtility.FromJson<CharacterResponse>(response);
            if (characterResponse != null && characterResponse.status == "successful")
            {
              UserDataService.Instance.UpdateCharacterData(characterResponse.data.characters);
            }
          },
          error =>
          {
            Debug.LogError("Failed to load data from character URL" + error);
            statusMessage.text = "Failed to load character data!";
          }
        )
      );
    }
  }
}
