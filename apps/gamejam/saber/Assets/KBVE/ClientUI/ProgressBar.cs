using KBVE.Events;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace KBVE.ClientUI
{
  public class ProgressBar : MonoBehaviour
  {
    private Slider progressBarSlider;
    private TMP_Text progressText;
    private Canvas canvas;

    private void Awake()
    {
      CreateProgressBarUI();

      ProgressBarEvent.OnProgressUpdate += SetProgress;
      ProgressBarEvent.OnShow += Show;
      ProgressBarEvent.OnHide += Hide;
    }

    private void OnDestroy()
    {
      // Unsubscribe from ProgressBarEvent events
      // Might need to come back to this later one.
      ProgressBarEvent.OnProgressUpdate -= SetProgress;
      ProgressBarEvent.OnShow -= Show;
      ProgressBarEvent.OnHide -= Hide;
    }

    void CreateProgressBarUI()
    {
      if (canvas == null)
      {
        // No Canvas found, create a new one
        GameObject canvasGO = new GameObject("Canvas");
        canvas = canvasGO.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay; // Assuming overlay mode
        canvasGO.AddComponent<CanvasScaler>();
        canvasGO.AddComponent<GraphicRaycaster>();
      }

      // Ensure the ProgressBar's parent is the canvas
      transform.SetParent(canvas.transform, false); // Set 'worldPositionStays' to false to keep local orientation but adopt the canvas' scale

      GameObject sliderGO = new GameObject("ProgressSlider");
      sliderGO.transform.SetParent(canvas.transform, false); // Parent to canvas, not to this.transform

      progressBarSlider = sliderGO.AddComponent<Slider>();
      progressBarSlider.minValue = 0;
      progressBarSlider.maxValue = 1;
      progressBarSlider.value = 0;

      RectTransform rt = sliderGO.GetComponent<RectTransform>();
      rt.anchoredPosition = new Vector2(0, 0); // Adjust this as needed
      rt.sizeDelta = new Vector2(200, 20); // Adjust this as needed

      GameObject textGO = new GameObject("ProgressText");
      textGO.transform.SetParent(sliderGO.transform, false);

      progressText = textGO.AddComponent<TextMeshProUGUI>();
      progressText.alignment = TextAlignmentOptions.Center;
      progressText.text = "0%";

      RectTransform textRT = textGO.GetComponent<RectTransform>();
      textRT.anchoredPosition = Vector2.zero;
      textRT.sizeDelta = new Vector2(200, 20);
    }

    public void SetProgress(float progress)
    {
      if (progressBarSlider != null)
      {
        progressBarSlider.value = progress;
      }

      if (progressText != null)
      {
        float clampedProgress = Mathf.Clamp01(progress);
        progressText.text = $"{clampedProgress * 100:0}%";
      }
    }

    // Methods to show/hide the progress bar as before
    public void Show() => gameObject.SetActive(true);

    public void Hide() => gameObject.SetActive(false);
  }
}
