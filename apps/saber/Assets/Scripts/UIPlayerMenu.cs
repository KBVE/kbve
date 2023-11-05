using UnityEngine;
using UnityEngine.UI;

public class UIPlayerMenu : MonoBehaviour
{
    public string menuImageResourcePath = "MenuButton/default";
    public Vector2 margins = new Vector2(20, 20);
    public Vector2 expandedSize = new Vector2(300, 200);
    private bool menuExpanded = false;
    private GameObject menuButtonObject;
    private Canvas canvas;
    private Text hintText;

    void Start()
    {
        // Create or find a Canvas in the scene
        canvas = FindObjectOfType<Canvas>();
        if (canvas == null)
        {
            GameObject canvasGameObject = new GameObject("Canvas");
            canvas = canvasGameObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasGameObject.AddComponent<CanvasScaler>();
            canvasGameObject.AddComponent<GraphicRaycaster>();
        }

        // Load the menu image from the Resources folder
        Sprite menuSprite = Resources.Load<Sprite>(menuImageResourcePath);
        if (menuSprite == null)
        {
            Debug.LogError("Menu image not found at path: " + menuImageResourcePath);
            return;
        }

        // Create a new GameObject for the menu button
        menuButtonObject = new GameObject("MenuButton");
        Button menuButton = menuButtonObject.AddComponent<Button>();
        menuButton.onClick.AddListener(ToggleMenu);  // Add onClick listener here


        // Set the sprite of the menu button
        Image menuImage = menuButtonObject.AddComponent<Image>();
        menuImage.sprite = menuSprite;

        // Set the parent to the Canvas GameObject, so that the button will be rendered
        menuButtonObject.transform.SetParent(canvas.transform);

        // Get the RectTransform and set the anchor to the top-right corner
        RectTransform rectTransform = menuButtonObject.GetComponent<RectTransform>();
        rectTransform.anchorMin = new Vector2(1, 1);
        rectTransform.anchorMax = new Vector2(1, 1);
        rectTransform.pivot = new Vector2(1, 1);
        rectTransform.anchoredPosition = -margins;  // Negative margins to offset from the top-right corner

       // Create a new GameObject for the hint text
        GameObject hintTextObject = new GameObject("HintText");
        hintText = hintTextObject.AddComponent<Text>();
        hintText.text = "M";
        hintText.color = new Color(0.5f, 0, 0.5f);  // Set text color to purple
        hintText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");  // Set font to LegacyRuntime
        hintText.fontSize = 40;  // Double the font size (assuming the original size was 20)
        hintTextObject.transform.SetParent(menuButtonObject.transform);  // Set parent to the menu button, so it moves together

        // Position the hint text at the bottom left corner of the menu button
        RectTransform hintRectTransform = hintTextObject.GetComponent<RectTransform>();
        hintRectTransform.anchorMin = new Vector2(0, 0);
        hintRectTransform.anchorMax = new Vector2(0, 0);
        hintRectTransform.pivot = new Vector2(0, 0);
        hintRectTransform.anchoredPosition = new Vector2(5, 5);  // Small offset to not overlap with the button border


        // Initially, set the menu to its collapsed state
        SetMenuState(false);
    }

    void ToggleMenu()
    {
        SetMenuState(!menuExpanded);  // Toggle the menu state
    }

    void Update()
    {
        // Check for the 'M' key press to toggle the menu
        if (Input.GetKeyDown(KeyCode.M))
        {
            SetMenuState(!menuExpanded);  // Toggle the menu state
        }
    }

    void SetMenuState(bool expanded)
    {
        menuExpanded = expanded;
        RectTransform rectTransform = menuButtonObject.GetComponent<RectTransform>();
        AspectRatioFitter aspectRatioFitter = menuButtonObject.GetComponent<AspectRatioFitter>();

        if (rectTransform != null)
        {
            if (expanded)
            {
                // Set the size of the menu to the expanded size
                rectTransform.sizeDelta = expandedSize;

                   if (aspectRatioFitter == null)
                  {
                      aspectRatioFitter = menuButtonObject.AddComponent<AspectRatioFitter>();
                  }

                  // Set the AspectRatioFitter properties
                  aspectRatioFitter.aspectMode = AspectRatioFitter.AspectMode.HeightControlsWidth;
                  aspectRatioFitter.aspectRatio = menuButtonObject.GetComponent<Image>().sprite.rect.width / menuButtonObject.GetComponent<Image>().sprite.rect.height;


                // Create or show the buttons
                CreateOrShowButtons(true);

                // Create or show the background
                CreateOrShowBackground(true);
            }
            else
            {
                // Set the size of the menu back to the original size
                rectTransform.sizeDelta = new Vector2(100, 100);  // Assuming the original size is 100x100

                // Disable or remove the AspectRatioFitter as the menu is collapsed
                if (aspectRatioFitter != null)
                  {
                      Destroy(aspectRatioFitter);
                  }

                // Hide the buttons
                CreateOrShowButtons(false);

                // Hide the background
                CreateOrShowBackground(false);
            }
        }
    }

    void CreateOrShowBackground(bool show)
    {
        Transform backgroundTransform = canvas.transform.Find("Background");
        if (show)
        {
            if (backgroundTransform == null)  // Background doesn't exist, create it
            {
                GameObject backgroundObject = new GameObject("Background");
                Image backgroundImage = backgroundObject.AddComponent<Image>();
                backgroundImage.color = new Color(0, 0, 0, 0.5f);  // Set color to black with 50% opacity
                backgroundObject.transform.SetParent(canvas.transform);  // Set parent to the canvas

                // Set the RectTransform properties to stretch the background
                RectTransform backgroundRectTransform = backgroundObject.GetComponent<RectTransform>();
                backgroundRectTransform.anchorMin = new Vector2(0, 0);
                backgroundRectTransform.anchorMax = new Vector2(1, 1);
                backgroundRectTransform.pivot = new Vector2(0.5f, 0.5f);
                backgroundRectTransform.anchoredPosition = Vector2.zero;
                backgroundRectTransform.sizeDelta = Vector2.zero;
            }
            else
            {
                backgroundTransform.gameObject.SetActive(true);  // Background exists, show it
            }
        }
        else
        {
            if (backgroundTransform != null)
                backgroundTransform.gameObject.SetActive(false);  // Hide background
        }
    }

    void CreateOrShowButtons(bool show)
    {
        Transform button1Transform = canvas.transform.Find("Button 1");
        Transform button2Transform = canvas.transform.Find("Button 2");
        if (show)
        {
            if (button1Transform == null)  // Button 1 doesn't exist, create it
                CreateButton(canvas.transform, "Button 1", new Vector2(0, 50));
            else
                button1Transform.gameObject.SetActive(true);  // Button 1 exists, show it

            if (button2Transform == null)  // Button 2 doesn't exist, create it
                CreateButton(canvas.transform, "Button 2", new Vector2(0, 0));
            else
                button2Transform.gameObject.SetActive(true);  // Button 2 exists, show it
        }
        else
        {
            if (button1Transform != null)
                button1Transform.gameObject.SetActive(false);  // Hide Button 1

            if (button2Transform != null)
                button2Transform.gameObject.SetActive(false);  // Hide Button 2
        }
    }

    void CreateButton(Transform parent, string buttonText, Vector2 anchoredPosition)
    {
        // Create a new GameObject for the button
        GameObject buttonObject = new GameObject(buttonText);
        Button button = buttonObject.AddComponent<Button>();

        // Set the parent to the Canvas GameObject, so that the button will be rendered
        buttonObject.transform.SetParent(parent);

        // Add and set up RectTransform
        RectTransform buttonRectTransform = buttonObject.AddComponent<RectTransform>();
        buttonRectTransform.anchoredPosition = anchoredPosition;
        buttonRectTransform.sizeDelta = new Vector2(160, 30);  // Assuming you want buttons of size 160x30

        // Set the text of the button
        GameObject textObject = new GameObject("Text");
        textObject.transform.SetParent(buttonObject.transform);
        Text buttonTextComponent = textObject.AddComponent<Text>();
        buttonTextComponent.text = buttonText;
        buttonTextComponent.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        buttonTextComponent.alignment = TextAnchor.MiddleCenter;

        // Adjust the RectTransform of the text to fill the button
        RectTransform textRectTransform = textObject.GetComponent<RectTransform>();
        textRectTransform.anchorMin = new Vector2(0, 0);
        textRectTransform.anchorMax = new Vector2(1, 1);
        textRectTransform.pivot = new Vector2(0.5f, 0.5f);
        textRectTransform.anchoredPosition = Vector2.zero;
        textRectTransform.sizeDelta = Vector2.zero;
    }
}
