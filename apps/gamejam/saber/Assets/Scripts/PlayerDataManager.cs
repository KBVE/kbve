using UnityEngine;
using UnityEngine.UI;
using System.Text;

[System.Serializable]
public class PlayerData
{
    public int level;
    public int health;
    public int scale;
    public float[] position = new float[3];

    public PlayerData()
    {
        level = 1;
        scale = 1000;  // which represents the scales on the dragon
        health = 100;
        position[0] = 0;
        position[1] = 0;
        position[2] = 0;
    }
}

public class PlayerDataManager : MonoBehaviour
{
    private static readonly string playerPrefKey = "playerData";
    private GameObject debugPanel;
    private Text debugText;
    private Transform playerTransform;

    void Start()
    {
        //playerTransform = GameObject.FindGameObjectWithTag("Player").transform;  // Assume player object is tagged "Player"
        // Find the Player GameObject
       GameObject player = GameObject.Find("Player");

        if (player != null)
        {
            // Check if the Player tag is assigned to the Player GameObject
            if (!player.CompareTag("Player"))
            {
                // Assign the Player tag to the Player GameObject
                player.tag = "Player";
            }

            // Get the Transform component of the Player GameObject
            playerTransform = player.transform;
        }
        else
        {
            Debug.LogError("Player GameObject not found. Please ensure a GameObject named 'Player' exists in the scene.");
        }

        CreateDebugDisplay();
        LoadPlayerData();
    }

    private void Update()
    {
        if (Input.GetKeyDown(KeyCode.BackQuote))
        {
            ToggleDebugDisplay();
        }
    }

     public void SavePlayerData()
    {
        PlayerData data = new PlayerData();
        Vector3 playerPosition = playerTransform.position;
        data.position[0] = playerPosition.x;
        data.position[1] = playerPosition.y;
        data.position[2] = playerPosition.z;
        string json = JsonUtility.ToJson(data);
        PlayerPrefs.SetString(playerPrefKey, json);
        PlayerPrefs.Save();
    }

    public PlayerData LoadPlayerData()
    {
        PlayerData data = new PlayerData();
        if (PlayerPrefs.HasKey(playerPrefKey))
        {
            string json = PlayerPrefs.GetString(playerPrefKey);
            data = JsonUtility.FromJson<PlayerData>(json);
            Vector3 playerPosition = new Vector3(data.position[0], data.position[1], data.position[2]);
            playerTransform.position = playerPosition;
        }
        return data;
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
        panelRect.sizeDelta = new Vector2(600, 600);
        panelRect.anchorMin = new Vector2(0.5f, 0.5f);
        panelRect.anchorMax = new Vector2(0.5f, 0.5f);
        panelRect.pivot = new Vector2(0.5f, 0.5f);
        panelRect.anchoredPosition = Vector2.zero;

        // Create Text element for displaying player data
        debugText = new GameObject("DebugText").AddComponent<Text>();
        debugText.transform.SetParent(debugPanel.transform, false);
        debugText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        debugText.fontSize = 30;
        debugText.alignment = TextAnchor.UpperLeft;
        debugText.horizontalOverflow = HorizontalWrapMode.Overflow;
        debugText.verticalOverflow = VerticalWrapMode.Overflow;
        debugText.color = Color.white;

        // Set up RectTransform for the text
        RectTransform textRect = debugText.GetComponent<RectTransform>();
        textRect.sizeDelta = new Vector2(580, 580); // Slightly smaller than the panel
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
        LoadPlayerData();  // Load player data and update player position

        PlayerData playerData = new PlayerData();  // Create a new PlayerData object
        Vector3 playerPosition = playerTransform.position;
        playerData.position[0] = playerPosition.x;
        playerData.position[1] = playerPosition.y;
        playerData.position[2] = playerPosition.z;

        StringBuilder sb = new StringBuilder();
        sb.AppendLine("Player Data:");
        sb.AppendLine("Level: " + playerData.level);
        sb.AppendLine("Health: " + playerData.health);
        sb.AppendLine("Scales: " + playerData.scale);
        sb.AppendLine($"Position: ({playerData.position[0]}, {playerData.position[1]}, {playerData.position[2]})");
        debugText.text = sb.ToString();
    }
}
