using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using System.Collections;

public class SceneLoader : MonoBehaviour
{
    private Slider progressBar;

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

        // Set up the slider values
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
        // Set the progress bar active
        progressBar.gameObject.SetActive(true);

        // Start async loading
        AsyncOperation asyncOperation = SceneManager.LoadSceneAsync(sceneName);
        asyncOperation.allowSceneActivation = false;

        // Update progress bar
        while (!asyncOperation.isDone)
        {
            float progress = Mathf.Clamp01(asyncOperation.progress / 0.9f);
            progressBar.value = progress;

            // Check if loading is finished
            if (asyncOperation.progress >= 0.9f)
            {
                asyncOperation.allowSceneActivation = true;
            }

            yield return null;
        }

        // Hide the progress bar
        progressBar.gameObject.SetActive(false);
    }
}
