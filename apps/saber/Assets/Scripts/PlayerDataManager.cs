using UnityEngine;
using UnityEngine.UI;
using System.Text;

[System.Serializable]
public class PlayerData
{
    public int level;
    public int health;
    public float[] position = new float[2];

    public PlayerData()
    {
        level = 1;
        health = 100;
        position[0] = 0;
        position[1] = 0;
    }
}

public class PlayerDataManager : MonoBehaviour
{
    private static readonly string playerPrefKey = "playerData";
    private GameObject debugPanel;
    private Text debugText;

    void Start()
    {
        CreateDebugDisplay();
    }

    private void Update()
    {
        if (Input.GetKeyDown(KeyCode.BackQuote))
        {
            ToggleDebugDisplay();
        }
    }

    public static void SavePlayerData(PlayerData data)
    {
        string json = JsonUtility.ToJson(data);
        PlayerPrefs.SetString(playerPrefKey, json);
        PlayerPrefs.Save();
    }

    public static PlayerData LoadPlayerData()
    {
        if (PlayerPrefs.HasKey(playerPrefKey))
        {
            string json = PlayerPrefs.GetString(playerPrefKey);
            return JsonUtility.FromJson<PlayerData>(json);
        }
        else
        {
            return new PlayerData();
        }
    }

    private void CreateDebugDisplay()
    {
        Canvas canvas = FindObjectOfType<Canvas>();
        if (canvas == null)
        {
            GameObject canvasObject = new GameObject("Canvas");
            canvas = canvasObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasObject.AddComponent<CanvasScaler>();
            canvasObject.AddComponent<GraphicRaycaster>();
        }

        // Create a new panel GameObject
        debugPanel = new GameObject("DebugPanel", typeof(Image));
        debugPanel.transform.SetParent(canvas.transform, false);
        debugPanel.GetComponent<Image>().color = new Color(0.1f, 0.1f, 0.1f, 0.7f); // Semi-transparent dark background

        // Set up RectTransform for the panel to be in the center
        RectTransform panelRect = debugPanel.GetComponent<RectTransform>();
        panelRect.sizeDelta = new Vector2(400, 200);
        panelRect.anchorMin = new Vector2(0.5f, 0.5f);
        panelRect.anchorMax = new Vector2(0.5f, 0.5f);
        panelRect.pivot = new Vector2(0.5f, 0.5f);
        panelRect.anchoredPosition = Vector2.zero;

        // Create Text element for displaying player data
        debugText = new GameObject("DebugText").AddComponent<Text>();
        debugText.transform.SetParent(debugPanel.transform, false);
        debugText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        debugText.alignment = TextAnchor.UpperLeft;
        debugText.horizontalOverflow = HorizontalWrapMode.Overflow;
        debugText.verticalOverflow = VerticalWrapMode.Overflow;
        debugText.color = Color.white;

        // Set up RectTransform for the text
        RectTransform textRect = debugText.GetComponent<RectTransform>();
        textRect.sizeDelta = new Vector2(380, 180); // Slightly smaller than the panel
        textRect.anchorMin = new Vector2(0.5f, 0.5f);
        textRect.anchorMax = new Vector2(0.5f, 0.5f);
        textRect.pivot = new Vector2(0.5f, 0.5f);
        textRect.anchoredPosition = Vector2.zero;

        // Create Close Button
        GameObject closeButton = new GameObject("CloseButton", typeof(Image), typeof(Button));
        closeButton.transform.SetParent(debugPanel.transform, false);
        Button btn = closeButton.GetComponent<Button>();
        Image btnImage = closeButton.GetComponent<Image>();
        btnImage.color = Color.red; // Just for visibility, use a proper graphic in a real scenario
        btn.onClick.AddListener(ToggleDebugDisplay);

        // Set up RectTransform for the button
        RectTransform btnRect = closeButton.GetComponent<RectTransform>();
        btnRect.sizeDelta = new Vector2(20, 20);
        btnRect.anchorMin = new Vector2(1, 1);
        btnRect.anchorMax = new Vector2(1, 1);
        btnRect.pivot = new Vector2(1, 1);
        btnRect.anchoredPosition = new Vector2(-10, -10);

        // Create a Text element for the button
        Text btnText = new GameObject("ButtonText").AddComponent<Text>();
        btnText.transform.SetParent(closeButton.transform, false);
        btnText.text = "X";
        btnText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        btnText.color = Color.white;
        btnText.alignment = TextAnchor.MiddleCenter;

        // Set up RectTransform for the button text
        RectTransform btnTextRect = btnText.GetComponent<RectTransform>();
        btnTextRect.sizeDelta = new Vector2(20, 20);
        btnTextRect.anchoredPosition = Vector2.zero;

        // Initially hide the debug panel
        debugPanel.SetActive(false);
    }

    private void ToggleDebugDisplay()
    {
        bool isActive = debugPanel.activeSelf;
        debugPanel.SetActive(!isActive);

        if (!isActive)
        {
            UpdateDebugDisplay();
        }
    }

    private void UpdateDebugDisplay()
    {
        PlayerData playerData = LoadPlayerData();

        StringBuilder sb = new StringBuilder();
        sb.AppendLine("Player Data:");
        sb.AppendLine("Level: " + playerData.level);
        sb.AppendLine("Health: " + playerData.health);
        sb.AppendLine($"Position: ({playerData.position[0]}, {playerData.position[1]})");

        debugText.text = sb.ToString();
    }
}
