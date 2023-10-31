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

      // Set RectTransform properties for proper positioning and size
      rectTransform.sizeDelta = new Vector2(200, 50);
      rectTransform.pivot = new Vector2(0.5f, 0);

      // Create a background object for the tooltip
      GameObject backgroundObject = new GameObject("Background");
      backgroundObject.transform.SetParent(tooltipObject.transform);
      RectTransform backgroundRectTransform = backgroundObject.AddComponent<RectTransform>();
      backgroundRectTransform.anchorMin = Vector2.zero;
      backgroundRectTransform.anchorMax = Vector2.one;
      backgroundRectTransform.offsetMin = Vector2.zero;
      backgroundRectTransform.offsetMax = Vector2.zero;
      Image backgroundImage = backgroundObject.AddComponent<Image>();
      backgroundImage.color = new Color(0, 0, 0, 0.5f);

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
