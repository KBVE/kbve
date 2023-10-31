using UnityEngine;
using UnityEngine.UI;

[RequireComponent(typeof(RectTransform))]
public class ResponsiveImageScaler : MonoBehaviour
{
    public Vector2 baseResolution = new Vector2(1920, 1080);  // Set your base resolution here
    private RectTransform rectTransform;
    private Vector2 originalSize;
    private Vector2 lastScreenSize;

    void Awake()
    {
        rectTransform = GetComponent<RectTransform>();
        originalSize = rectTransform.sizeDelta;
        lastScreenSize = new Vector2(Screen.width, Screen.height);
        ScaleImage();
    }

    void Update()
    {
        Vector2 currentScreenSize = new Vector2(Screen.width, Screen.height);
        if (lastScreenSize != currentScreenSize)
        {
            lastScreenSize = currentScreenSize;
            ScaleImage();
        }
    }

    void ScaleImage()
    {
        float horizontalRatio = Screen.width / baseResolution.x;
        float verticalRatio = Screen.height / baseResolution.y;
        float ratio = Mathf.Min(horizontalRatio, verticalRatio);
        rectTransform.sizeDelta = new Vector2(originalSize.x * ratio, originalSize.y * ratio);
    }
}
