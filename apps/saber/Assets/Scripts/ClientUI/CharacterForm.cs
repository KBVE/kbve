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

    public TMP_InputField characterNameField;
    public TMP_InputField characterDescriptionField;

    public Button playButton;

    public Button characterCreationButton;

    // TODO Prefab GameObject Character Button
    public GameObject buttonPrefab;
    public RectTransform buttonsContainer;

    private IAPIRequestService _apiService;
    private IUserDataService _userDataService;

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
      Debug.Log($"Network Error: {error}");
      // if (statusMessage != null)
      // {
      //   statusMessage.text = "Networking Error! from CharacterForm";
      // }
    }

    private void Start()
    {
      _apiService = Services.Services.Instance.GetService<IAPIRequestService>();
      _userDataService = Services.Services.Instance.GetService<IUserDataService>();

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

      if (_userDataService == null)
      {
        statusMessage.text = "Data Service has an error from CharacterForm";
        Debug.LogError("Failed to retrieve Data Service.");
        return;
      }

      if (playButton != null)
      {
        playButton.onClick.AddListener(OnPlayClicked);
      }

      if (characterCreationButton != null)
      {
        characterCreationButton.onClick.AddListener(CreateCharactersFromAPI);
      }

      PullCharactersFromAPI();
    }

    private void OnPlayClicked()
    {
      Debug.Log("Play button clicked.");
      //
    }

    private void PullCharactersFromAPI()
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
              PopulateCharacterList();
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

    private void CreateCharactersFromAPI()
    {
      string name = characterNameField.text;
      string description = characterDescriptionField.text;

      CharacterCreationRequest request = new CharacterCreationRequest(name, description);
      string jsonPayloadData = JsonUtility.ToJson(request);

      string api_character_creation_url = "https://rust.kbve.com/api/v1/auth/character-creation";

      StartCoroutine(
        _apiService.SendPostRequest(
          api_character_creation_url,
          jsonPayloadData,
          response =>
          {
            Debug.Log("Character was successful");
            PullCharactersFromAPI();
          },
          error =>
          {
            Debug.Log("Failed to create character: " + error);
            CharacterCreationError errorResponse = JsonUtility.FromJson<CharacterCreationError>(
              error
            );
            string errorMessage = errorResponse.error ?? errorResponse.message.error;
            statusMessage.text = "Error: " + errorMessage;
          }
        )
      );
    }

    void PopulateCharacterList()
    {

      ClearCharacterButtons();
      var characters = _userDataService.ListCharacters();
      if (characters == null || characters.Count == 0)
      {
        Debug.Log("No characters found");
        // Optionally, update the statusMessage or another UI element to inform the user
        if (statusMessage != null)
        {
          statusMessage.text = "No characters found.";
        }
        return; // Exit the method early if no characters are found
      }

      foreach (Character character in characters)
      {
        GameObject buttonObj = Instantiate(buttonPrefab, buttonsContainer.transform, false);
        buttonObj.transform.localScale = Vector3.one;
        TMP_Text buttonText = buttonObj.GetComponentInChildren<TMP_Text>();
        if (buttonText != null)
        {
          buttonText.text = character.name;
        }
        else
        {
          Debug.LogError("Button TMP Text Not Found");
        }

        RectTransform rectTransform = buttonObj.GetComponent<RectTransform>();
        rectTransform.anchoredPosition = Vector2.zero;
        rectTransform.localScale = Vector3.one;
        rectTransform.sizeDelta = new Vector2(200, 50);

        Button button = buttonObj.GetComponentInChildren<Button>();
        if (button != null)
        {
          string url = $"https://rust.kbve.com/api/v1/sheet/{character.name}";
          button.onClick.AddListener(() => OpenCharacterSheet(url));
        }
        else
        {
          Debug.LogError("Button component not found on the instantiated object.");
        }
      }
    }

    public void OpenCharacterSheet(string url)
    {
      Debug.Log("Open Character Button Clicked!");
      Application.OpenURL(url);
    }

    private void ClearCharacterButtons()
    {
      foreach (Transform child in buttonsContainer)
      {
        Destroy(child.gameObject);
      }
    }
  }
}
