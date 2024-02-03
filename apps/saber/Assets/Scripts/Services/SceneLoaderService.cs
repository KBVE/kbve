using System.Collections;
using KBVE.Events;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace KBVE.Services
{
  public interface ISceneLoaderService
  {
    void LoadScene(string sceneName);
  }

  public class SceneLoaderService : MonoBehaviour, ISceneLoaderService
  {
    public static SceneLoaderService Instance { get; private set; }

    private void Awake()
    {
      if (Instance != null && Instance != this)
      {
        Destroy(this.gameObject);
      }
      else
      {
        Instance = this;
        DontDestroyOnLoad(this.gameObject); // Keep instance alive across scenes
      }
    }

    public void LoadScene(string sceneName)
    {
      StartCoroutine(LoadSceneAsync(sceneName));
    }

    private IEnumerator LoadSceneAsync(string sceneName)
    {
      ProgressBarEvent.Show();

      var asyncLoad = SceneManager.LoadSceneAsync(sceneName);
      asyncLoad.allowSceneActivation = false;

      while (!asyncLoad.isDone)
      {
        float progress = Mathf.Clamp01(asyncLoad.progress / 0.9f);
        ProgressBarEvent.UpdateProgress(progress);

        if (asyncLoad.progress >= 0.9f)
        {
          asyncLoad.allowSceneActivation = true;
        }

        yield return null;
      }

      ProgressBarEvent.Hide();
    }
  }
}
