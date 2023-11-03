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
            rectTransform.sizeDelta = new Vector2(200, 50);
            rectTransform.pivot = new Vector2(0.5f, 0);
            tooltipObject.SetActive(false);

            // Creating the Sprite for Tooltip.
            GameObject spriteObject = new GameObject("Sprite");
            spriteObject.transform.SetParent(tooltipObject.transform);
            RectTransform spriteRectTransform = spriteObject.AddComponent<RectTransform>();
            spriteRectTransform.anchorMin = Vector2.zero;
            spriteRectTransform.anchorMax = Vector2.one;
            spriteRectTransform.sizeDelta = Vector2.zero;
            spriteRectTransform.anchoredPosition = Vector2.zero;
            Image spriteImage = spriteObject.AddComponent<Image>();


            // Load the sprite from the specified path
            Sprite tooltipSprite = Resources.Load<Sprite>("SaberButton/default");
            if (tooltipSprite != null)
            {
                spriteImage.sprite = tooltipSprite;
                spriteImage.preserveAspect = false;
                spriteImage.type = Image.Type.Simple;
                spriteImage.fillCenter = true;
            }
            else
            {
                Debug.LogWarning("Failed to load sprite from Assets/Resources/SaberButton/default.png");
            }

            //  // Create a black overlay object for the tooltip
            // GameObject overlayObject = new GameObject("Overlay");
            // overlayObject.transform.SetParent(tooltipObject.transform);
            // RectTransform overlayRectTransform = overlayObject.AddComponent<RectTransform>();
            // overlayRectTransform.anchorMin = Vector2.zero;
            // overlayRectTransform.anchorMax = Vector2.one;
            // overlayRectTransform.sizeDelta = Vector2.zero;
            // overlayRectTransform.anchoredPosition = Vector2.zero;
            // Image overlayImage = overlayObject.AddComponent<Image>();
            // overlayImage.color = new Color(0, 0, 0, 0.5f);  // Black color with 50% transparency

            // // Ensure the black overlay is rendered on top of the sprite
            // overlayObject.transform.SetAsLastSibling();


            // Create the Text component
            GameObject textObject = new GameObject("Text");
            textObject.transform.SetParent(tooltipObject.transform);
            RectTransform textRectTransform = textObject.AddComponent<RectTransform>();
            textRectTransform.anchorMin = Vector2.zero;
            textRectTransform.anchorMax = Vector2.one;
            textRectTransform.sizeDelta = Vector2.zero;
            textRectTransform.anchoredPosition = Vector2.zero;
            Text textComponent = textObject.AddComponent<Text>();
            textComponent.text = tooltipText;
            textComponent.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            textComponent.fontStyle = FontStyle.Bold;
            //textComponent.characterSpacing = 2;
            textComponent.alignment = TextAnchor.MiddleCenter;
            textComponent.color = new Color(0.5f, 0, 0.5f);  // Purple color

  }

    public void OnPointerEnter(PointerEventData eventData)
    {
      if (tooltipObject != null)
        {
            // Adjust the offset value to position the tooltip higher above the button
            float yOffset = transform.localScale.y / 2 + 60f;
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
