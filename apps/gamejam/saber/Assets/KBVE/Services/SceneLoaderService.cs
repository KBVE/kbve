using System.Collections;
using KBVE.Events;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace KBVE.Services
{
  public interface ISceneLoaderService
  {
    void LoadSceneSingle(string sceneName);
    void LoadSceneAdditive(string sceneName);
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

    private void OnEnable()
    {
      // Subscribe to the OnSceneLoadRequested event when the GameObject is enabled
      SceneEvent.OnSceneLoadRequested += LoadSceneAdditive;
      SceneEvent.OnSingleSceneLoadRequested += LoadSceneSingle;
    }

    private void OnDisable()
    {
      // Unsubscribe from the OnSceneLoadRequested event when the GameObject is disabled
      SceneEvent.OnSceneLoadRequested -= LoadSceneAdditive;
      SceneEvent.OnSingleSceneLoadRequested -= LoadSceneSingle;
    }

    public void LoadSceneAdditive(string sceneName)
    {
      StartCoroutine(LoadSceneAsync(sceneName, LoadSceneMode.Additive));
    }

    public void LoadSceneSingle(string sceneName)
    {
      Debug.Log($"Loading scene: {sceneName} (Single)");
      StartCoroutine(LoadSceneAsync(sceneName, LoadSceneMode.Single));
    }

    private IEnumerator LoadSceneAsync(string sceneName, LoadSceneMode mode)
    {
      ProgressBarEvent.Show();
      var asyncLoad = SceneManager.LoadSceneAsync(sceneName, mode);
      asyncLoad.allowSceneActivation = false;

      while (!asyncLoad.isDone)
      {
        float progress = Mathf.Clamp01(asyncLoad.progress / 0.9f);
        ProgressBarEvent.UpdateProgress(progress);

        if (asyncLoad.progress >= 0.9f && !asyncLoad.allowSceneActivation)
        {
          asyncLoad.allowSceneActivation = true; // Allow scene activation
        }

        yield return null;
      }

      ProgressBarEvent.Hide();
    }
  }
}
