using UnityEngine;

[RequireComponent(typeof(RectTransform))]
public class UIButtonScaler : MonoBehaviour
{
    private RectTransform rectTransform;
    private Vector2 lastScreenSize;

    void Awake()
    {
        rectTransform = GetComponent<RectTransform>();
        lastScreenSize = new Vector2(Screen.width, Screen.height);
        SetAnchorAndPivot();
        UpdatePosition();
    }

    void Update()
    {
        Vector2 currentScreenSize = new Vector2(Screen.width, Screen.height);
        if (lastScreenSize != currentScreenSize)
        {
            lastScreenSize = currentScreenSize;
            UpdatePosition();
        }
    }

    void SetAnchorAndPivot()
    {
        rectTransform.anchorMin = new Vector2(0.5f, 0);  // Bottom center
        rectTransform.anchorMax = new Vector2(0.5f, 0);  // Bottom center
        rectTransform.pivot = new Vector2(0.5f, 0);  // Bottom center
    }

    void UpdatePosition()
    {
        float margin = 100f;  // Margin from the bottom edge of the canvas
        Vector2 newPosition = new Vector2(0, margin);  
        rectTransform.anchoredPosition = newPosition;
    }
}