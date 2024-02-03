using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace KBVE.ClientUI
{
  public class ProgressBar : MonoBehaviour
  {
    private Slider progressBarSlider;
    private TMP_Text progressText;

    void Start()
    {
      CreateProgressBarUI();
    }

    void CreateProgressBarUI()
    {
      // Create Slider GameObject
      GameObject sliderGO = new GameObject("ProgressSlider");
      sliderGO.transform.SetParent(this.transform); // Set as child of this GameObject

      // Add and setup Slider component
      progressBarSlider = sliderGO.AddComponent<Slider>();
      progressBarSlider.minValue = 0;
      progressBarSlider.maxValue = 1;
      progressBarSlider.value = 0;

      // Adjust the Slider's RectTransform
      RectTransform rt = sliderGO.GetComponent<RectTransform>();
      rt.anchoredPosition = new Vector2(0, 0); // Position it as needed
      rt.sizeDelta = new Vector2(200, 20); // Set the size

      // Optionally create TextMeshPro text for displaying progress
      GameObject textGO = new GameObject("ProgressText");
      textGO.transform.SetParent(sliderGO.transform); // Set as child of the slider GameObject

      progressText = textGO.AddComponent<TextMeshProUGUI>();
      progressText.alignment = TextAlignmentOptions.Center;
      progressText.text = "0%";

      // Adjust the Text's RectTransform
      RectTransform textRT = textGO.GetComponent<RectTransform>();
      textRT.anchoredPosition = new Vector2(0, 0);
      textRT.sizeDelta = new Vector2(200, 20); // Match slider size or as needed

      // Ensure the Slider and TextMeshPro are positioned and sized appropriately
      // You might need to adjust anchors, pivot, and size to fit your UI layout
    }

    public void SetProgress(float progress)
    {
      if (progressBarSlider != null)
      {
        progressBarSlider.value = progress;
      }

      if (progressText != null)
      {
        progressText.text = $"{progress * 100:0}%";
      }
    }

    // Methods to show/hide the progress bar as before
    public void Show() => gameObject.SetActive(true);

    public void Hide() => gameObject.SetActive(false);
  }
}
