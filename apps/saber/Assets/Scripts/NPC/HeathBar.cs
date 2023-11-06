using UnityEngine;
using UnityEngine.UI;

public class HealthBar : MonoBehaviour
{
    private Slider slider;
    private Text nameText;
    private RectTransform canvasRect;

    public void Initialize(int maxHealth, string npcName)
    {
        // Create a new GameObject for the Canvas
        GameObject canvasGO = new GameObject("HealthCanvas");
        canvasGO.transform.SetParent(transform);
        canvasRect = canvasGO.AddComponent<RectTransform>();
        canvasGO.layer = LayerMask.NameToLayer("UI");

        // Configure the Canvas component
        Canvas canvas = canvasGO.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.WorldSpace;
        CanvasScaler cs = canvasGO.AddComponent<CanvasScaler>();
        cs.dynamicPixelsPerUnit = 10;
        GraphicRaycaster gr = canvasGO.AddComponent<GraphicRaycaster>();

        // Set the size of the Canvas
        canvasRect.sizeDelta = new Vector2(100, 100);

        // Create a Slider as a child of the Canvas
        GameObject sliderGO = new GameObject("HealthSlider");
        sliderGO.transform.SetParent(canvasGO.transform);
        sliderGO.layer = LayerMask.NameToLayer("UI");
        slider = sliderGO.AddComponent<Slider>();

        // Set up the Slider RectTransform
        RectTransform sliderRect = slider.GetComponent<RectTransform>();
        sliderRect.sizeDelta = new Vector2(100, 20);
        sliderRect.localPosition = new Vector3(0, 0, 0);

        // Configure the Slider component
        slider.minValue = 0;
        slider.maxValue = maxHealth;
        slider.value = maxHealth;

        // Optional: Add visual elements to the Slider here...

        // Create a Text as a child of the Canvas for NPC's name
        GameObject textGO = new GameObject("NPCNameText");
        textGO.transform.SetParent(canvasGO.transform);
        textGO.layer = LayerMask.NameToLayer("UI");
        nameText = textGO.AddComponent<Text>();
        nameText.text = npcName;
        nameText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        nameText.fontSize = 14;
        nameText.alignment = TextAnchor.UpperCenter;
        nameText.color = Color.black;

        // Set up the Text RectTransform
        RectTransform textRect = nameText.GetComponent<RectTransform>();
        textRect.sizeDelta = new Vector2(100, 20);
        textRect.localPosition = new Vector3(0, 30, 0); // Position it above the slider
    }

    public void SetHealth(int health)
    {
        slider.value = health;
    }

    private void LateUpdate()
    {
        // Keep the health bar facing the camera
        if (canvasRect != null)
        {
            canvasRect.LookAt(canvasRect.position + Camera.main.transform.rotation * Vector3.forward,
                              Camera.main.transform.rotation * Vector3.up);
        }
    }
}
