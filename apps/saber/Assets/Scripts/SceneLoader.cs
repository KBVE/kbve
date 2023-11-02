using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

public class SceneLoader : MonoBehaviour
{
  public Slider progressBar;  // Reference to the UI Slider component

  public void LoadSceneAsync(string sceneName)
  {
    StartCoroutine(LoadYourAsyncScene(sceneName));
  }

  private System.Collections.IEnumerator LoadYourAsyncScene(string sceneName)
  {
    AsyncOperation asyncLoad = SceneManager.LoadSceneAsync(sceneName);
    asyncLoad.allowSceneActivation = false;  // Don't allow the scene to activate until loading is complete

    while (!asyncLoad.isDone)
    {
      // Update the progress bar value
      progressBar.value = Mathf.Clamp01(asyncLoad.progress / 0.9f);

      // Check if the loading is complete and ready to activate the scene
      if (asyncLoad.progress >= 0.9f)
      {
        asyncLoad.allowSceneActivation = true;  // Allow the scene to activate
      }

      yield return null;
    }
  }
}
