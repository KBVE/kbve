using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using System.Collections;

public class SaberButton : MonoBehaviour, IPointerClickHandler, IPointerEnterHandler, IPointerExitHandler
{
    [SerializeField] private Vector3 normalScale = new Vector3(1, 1, 1);
    [SerializeField] private Vector3 pressedScale = new Vector3(1.1f, 1.1f, 1.1f);
    [SerializeField] private float animationDuration = 0.1f;
    [SerializeField] private string tooltipText = "Tooltip text here";

    private GameObject tooltipObject;
    private Canvas canvas;

    private void Awake()
    {
        // Find or create the canvas
        canvas = FindObjectOfType<Canvas>();
        if (canvas == null)
        {
            GameObject canvasObject = new GameObject("Canvas");
            canvas = canvasObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasObject.AddComponent<CanvasScaler>();
            canvasObject.AddComponent<GraphicRaycaster>();
        }

            // Create the tooltip object
        tooltipObject = new GameObject("Tooltip");
        tooltipObject.transform.SetParent(canvas.transform);
        RectTransform rectTransform = tooltipObject.AddComponent<RectTransform>();
        tooltipObject.SetActive(false);
        rectTransform.sizeDelta = new Vector2(200, 50);
        rectTransform.pivot = new Vector2(0.5f, 0);

        // Create a black background object for the tooltip
           GameObject backgroundObject = new GameObject("Background");
        backgroundObject.transform.SetParent(tooltipObject.transform);
        RectTransform backgroundRectTransform = backgroundObject.AddComponent<RectTransform>();
        backgroundRectTransform.anchorMin = Vector2.zero;
        backgroundRectTransform.anchorMax = Vector2.one;
        backgroundRectTransform.offsetMin = Vector2.zero;
        backgroundRectTransform.offsetMax = Vector2.zero;
        Image backgroundImage = backgroundObject.AddComponent<Image>();
        backgroundImage.color = new Color(0, 0, 0, 0.5f);  // Black color with 50% transparency

           // Create a sprite object for the tooltip
    GameObject spriteObject = new GameObject("Sprite");
    spriteObject.transform.SetParent(tooltipObject.transform);
    RectTransform spriteRectTransform = spriteObject.AddComponent<RectTransform>();
    spriteRectTransform.anchorMin = Vector2.zero;
    spriteRectTransform.anchorMax = Vector2.one;
    spriteRectTransform.sizeDelta = Vector2.zero;  // This line ensures that the spriteRectTransform expands to fill the parent tooltipObject
    spriteRectTransform.anchoredPosition = Vector2.zero;  // This line ensures that the spriteRectTransform is centered within the parent tooltipObject
    Image spriteImage = spriteObject.AddComponent<Image>();

    // Load the sprite from the specified path
    Sprite tooltipSprite = Resources.Load<Sprite>("SaberButton/default");
    if (tooltipSprite != null)
    {
        spriteImage.sprite = tooltipSprite;
        spriteImage.preserveAspect = false;  // Allow the sprite to be stretched to fill the box
        spriteImage.type = Image.Type.Simple;
        spriteImage.fillCenter = true;
    }
    else
    {
        Debug.LogWarning("Failed to load sprite from Assets/Resources/SaberButton/default.png");
    }



      // Create the Text component
      Text textComponent = tooltipObject.AddComponent<Text>();
      textComponent.text = tooltipText;
      textComponent.font = Font.CreateDynamicFontFromOSFont("Arial", 14);
      textComponent.alignment = TextAnchor.MiddleCenter;
      textComponent.color = new Color(0.5f, 0, 0.5f);  // Purple color
  }

    public void OnPointerEnter(PointerEventData eventData)
    {
      if (tooltipObject != null)
        {
            // Adjust the offset value to position the tooltip higher above the button
            float yOffset = transform.localScale.y / 2 + 15f;
            tooltipObject.transform.position = transform.position + new Vector3(0, yOffset, 0);
            tooltipObject.SetActive(true);
        }
    }

    public void OnPointerExit(PointerEventData eventData)
    {
        if (tooltipObject != null)
        {
            tooltipObject.SetActive(false);
        }
    }

    public void OnPointerClick(PointerEventData eventData)
    {
        StartCoroutine(AnimateButton());
    }

    private IEnumerator AnimateButton()
    {
        float elapsedTime = 0f;

        while (elapsedTime < animationDuration)
        {
            transform.localScale = Vector3.Lerp(normalScale, pressedScale, (elapsedTime / animationDuration));
            elapsedTime += Time.deltaTime;
            yield return null;
        }

        transform.localScale = pressedScale;
        elapsedTime = 0f;

        while (elapsedTime < animationDuration)
        {
            transform.localScale = Vector3.Lerp(pressedScale, normalScale, (elapsedTime / animationDuration));
            elapsedTime += Time.deltaTime;
            yield return null;
        }

        transform.localScale = normalScale;
    }
}
