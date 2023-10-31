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
            canvas.renderMode = RenderMode.WorldSpace;
            canvasObject.AddComponent<CanvasScaler>();
            canvasObject.AddComponent<GraphicRaycaster>();
        }

        // Create the tooltip object
        tooltipObject = new GameObject("Tooltip");
        tooltipObject.transform.SetParent(canvas.transform);
        tooltipObject.AddComponent<RectTransform>();
        tooltipObject.SetActive(false);

        // Create the Text component
        Text textComponent = tooltipObject.AddComponent<Text>();
        textComponent.text = tooltipText;
        textComponent.font = Font.CreateDynamicFontFromOSFont("Arial", 14);
        textComponent.alignment = TextAnchor.MiddleCenter;
        textComponent.color = Color.black;
    }

    public void OnPointerEnter(PointerEventData eventData)
    {
        if (tooltipObject != null)
        {
            tooltipObject.transform.position = transform.position + new Vector3(0, transform.localScale.y / 2 + 0.1f, 0);
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
