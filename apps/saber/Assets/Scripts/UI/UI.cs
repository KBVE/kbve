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

    return canvas;
  }

  public static Image CreateBar(
    Canvas parentCanvas,
    string name,
    Color color,
    Vector2 anchoredPosition,
    Vector2 size
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
    return barImage;
  }
}
