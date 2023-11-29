using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class UI
{
  public static Canvas CreateCanvas(GameObject parent, Vector3 offset, Vector2 size, Camera camera)
  {
    GameObject canvasGameObject = new GameObject("EntityCanvas");
    Canvas canvas = canvasGameObject.AddComponent<Canvas>();
    canvas.renderMode = RenderMode.WorldSpace;
    canvas.worldCamera = camera;

    RectTransform canvasRT = canvasGameObject.GetComponent<RectTransform>();
    canvasRT.sizeDelta = size;
    canvasGameObject.transform.SetParent(parent.transform);
    canvasGameObject.transform.localPosition = offset;
    canvasGameObject.transform.localScale = new Vector3(0.8f, 0.8f, 0.8f); // Adjust as necessary

    return canvas;
  }

  public static (Image barImage, TextMeshProUGUI barText) CreateBar(
    Canvas parentCanvas,
    string name,
    Color color,
    Vector2 anchoredPosition,
    Vector2 size,
    string initialValue,
    bool rotateText
  )
  {
    GameObject barGameObject = new GameObject(name);
    barGameObject.transform.SetParent(parentCanvas.transform, false);
    Image barImage = barGameObject.AddComponent<Image>();
    barImage.color = color;
    barImage.rectTransform.sizeDelta = size;
    barImage.rectTransform.anchoredPosition = anchoredPosition;
    barImage.type = Image.Type.Filled;
    barImage.fillMethod = Image.FillMethod.Horizontal;

    // Adding TMP Text to the Bar
    GameObject textGO = new GameObject(name + "Text");
    textGO.transform.SetParent(barGameObject.transform, false);
    textGO.transform.localScale = new Vector3(0.3f, 0.3f, 0.3f);
    // textGO.transform.localRotation = Quaternion.Euler(0, 180, 0);
    if (rotateText)
    {
      textGO.transform.localRotation = Quaternion.Euler(0, 180, 0);
    }
    TextMeshProUGUI barText = textGO.AddComponent<TextMeshProUGUI>();
    barText.text = initialValue;
    barText.enableWordWrapping = false;
    //barText.overflowMode = TextOverflowModes.Overflow;
    barText.alignment = TextAlignmentOptions.Center;
    barText.color = Color.white;
    //barText.enableAutoSizing = true;
    barText.fontSize = 1; // Adjust as needed

    RectTransform textRT = textGO.GetComponent<RectTransform>();
    textRT.sizeDelta = size; // Match the size of the bar
    //!  textRT.sizeDelta = new Vector2(size.x, size.y);
    textRT.anchoredPosition = Vector2.zero; // Center in the bar
    textRT.anchorMin = new Vector2(0.5f, 0.5f); // Center anchor
    textRT.anchorMax = new Vector2(0.5f, 0.5f); // Center anchor
    textRT.pivot = new Vector2(0.5f, 0.5f); // Center pivot

    return (barImage, barText);
  }

  public static void UpdateStatsBar(
    int currentStat,
    int maxStat,
    Image statBarImage,
    TextMeshProUGUI statBarText
  )
  {
    float fillAmount = (maxStat != 0) ? (float)currentStat / maxStat : 0;
    statBarImage.fillAmount = fillAmount;

    if (statBarText != null)
    {
      statBarText.text = currentStat + " / " + maxStat;
    }
  }
}
