using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using System.Collections;

public class SceneLoader : MonoBehaviour
{
    private Slider progressBar;
    private Image fadeImage;


    void Start()
    {
        CreateProgressBar();

    }

    private void CreateProgressBar()
    {
        // Create a new Canvas GameObject
        GameObject canvasGameObject = new GameObject("Canvas");
        canvasGameObject.layer = LayerMask.NameToLayer("UI");
        Canvas canvas = canvasGameObject.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.WorldSpace;
        CanvasScaler cs = canvasGameObject.AddComponent<CanvasScaler>();
        cs.scaleFactor = 10.0f;
        cs.dynamicPixelsPerUnit = 10f;
        canvasGameObject.AddComponent<GraphicRaycaster>();

        // Create a new Slider GameObject
        GameObject sliderGameObject = new GameObject("Slider");
        sliderGameObject.transform.SetParent(canvasGameObject.transform);
        sliderGameObject.transform.localPosition = Vector3.zero;
        progressBar = sliderGameObject.AddComponent<Slider>();

      // Create a new Image GameObject for the fade effect
        GameObject imageGameObject = new GameObject("FadeImage");
        imageGameObject.transform.SetParent(progressBar.transform.parent);
        imageGameObject.transform.localPosition = Vector3.zero;
        RectTransform rectTransform = imageGameObject.AddComponent<RectTransform>();
        rectTransform.anchorMin = Vector2.zero;  // Anchor to the bottom-left
        rectTransform.anchorMax = Vector2.one;   // Anchor to the top-right
        rectTransform.offsetMin = Vector2.zero;
        rectTransform.offsetMax = Vector2.zero;  // Stretch to cover the whole screen
        fadeImage = imageGameObject.AddComponent<Image>();
        fadeImage.color = new Color(0, 0, 0, 0);  // transparent black

        // Set up the slider values
        progressBar.transform.SetSiblingIndex(1);
        progressBar.minValue = 0;
        progressBar.maxValue = 1;
        progressBar.value = 0;

        // Optionally add visual elements to your slider here

    }

    public void LoadScene(string sceneName)
    {
        StartCoroutine(LoadSceneAsync(sceneName));
    }

    private IEnumerator LoadSceneAsync(string sceneName)
    {
        // Set the progress bar and fade image active
        progressBar.gameObject.SetActive(true);
        fadeImage.gameObject.SetActive(true);

        // Start async loading
        AsyncOperation asyncOperation = SceneManager.LoadSceneAsync(sceneName);
        asyncOperation.allowSceneActivation = false;

        while (!asyncOperation.isDone)
        {
            float progress = Mathf.Clamp01(asyncOperation.progress / 0.9f);
            progressBar.value = progress;

            // Tie the alpha value of the fade image to the progress
            fadeImage.color = new Color(0, 0, 0, progress);

            // Check if loading is finished
            if (asyncOperation.progress >= 0.9f)
            {
                asyncOperation.allowSceneActivation = true;
            }

            yield return null;
        }

        // Ensure the fade image is fully opaque
        fadeImage.color = new Color(0, 0, 0, 1);

        // Hide the progress bar and fade image
        progressBar.gameObject.SetActive(false);
        fadeImage.gameObject.SetActive(false);
    }
}
