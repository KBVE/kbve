using System;
using KBVE.Events;
using UnityEngine;
using UnityEngine.SceneManagement;


namespace KBVE.Services
{
  public interface IWeatherService
  {
    void ChangeWeatherCondition(string condition);
  }

  public class WeatherService : MonoBehaviour, IWeatherService
  {
    public static WeatherService Instance { get; private set; }

    [SerializeField]
    private Light directionalLight;

    [SerializeField]
    private float dayLengthInSeconds = 1200f;
    private float currentTimeOfDay = 0f;

    // ? 1200f is 20mins for a full day cycle

    private void Awake()
    {
      if (Instance != null && Instance != this)
      {
        Destroy(gameObject);
      }
      else
      {
        Instance = this;
        DontDestroyOnLoad(gameObject);
        InitializeDirectionalLight();
      }
    }

    private void Update()
    {
      UpdateTimeOfDay();
      UpdateLightingBasedOnTimeOfDay();
    }

    private void UpdateTimeOfDay()
    {
      currentTimeOfDay += Time.deltaTime / dayLengthInSeconds;
      currentTimeOfDay %= 1;

      UpdateLightingBasedOnTimeOfDay();

      if (currentTimeOfDay < 0.25f || currentTimeOfDay > 0.75f)
      {
        WeatherEvents.TriggerNightStarted();
      }
      else
      {
        WeatherEvents.TriggerDayStarted();
      }
    }

    private void UpdateLightingBasedOnTimeOfDay()
    {
      if (directionalLight == null)
      {
        InitializeDirectionalLight(); // Ensure light is re-initialized if it was destroyed
        if (directionalLight == null)
          return; // If still null, exit to avoid errors
      }

      float angle = (currentTimeOfDay * 360f) - 90f; // Shift by -90 degrees to start at dawn
      directionalLight.transform.localRotation = Quaternion.Euler(angle, -30f, 0f);

      if (currentTimeOfDay <= 0.25f || currentTimeOfDay >= 0.75f)
      {
        //  ? Night Light
        directionalLight.color = Color.Lerp(
          Color.blue,
          Color.black,
          Mathf.Abs(currentTimeOfDay - 0.75f) * 4f
        );
        directionalLight.intensity = Mathf.Lerp(
          0.1f,
          0.5f,
          Mathf.Sin(currentTimeOfDay * 2 * Mathf.PI)
        );
      }
      else
      {
        //  ? Day Light
        directionalLight.color = Color.Lerp(
          Color.yellow,
          Color.white,
          Mathf.Abs(currentTimeOfDay - 0.5f) * 4f
        );
        directionalLight.intensity = Mathf.Lerp(
          0.5f,
          1f,
          Mathf.Sin(currentTimeOfDay * 2 * Mathf.PI)
        );
      }
    }

    public void ChangeWeatherCondition(string condition)
    {
      switch (condition)
      {
        case "Rain":
          StartRain();
          break;
        case "Clear":
          StopRain();
          break;
        // Add more cases for other weather conditions like "Fog", "Cloudy", etc.
        default:
          Debug.LogWarning($"Unknown weather condition: {condition}");
          break;
      }
    }

    private void StartRain()
    {
      Debug.Log("Rain started.");
      directionalLight.color = Color.gray;
      directionalLight.intensity = 0.5f;
    }

    private void StopRain()
    {
      Debug.Log("Rain stopped.");
      UpdateLightingBasedOnTimeOfDay();
    }

    private void InitializeDirectionalLight()
    {
      if (directionalLight == null)
      {
        GameObject lightGameObject = new GameObject("Directional Light");
        directionalLight = lightGameObject.AddComponent<Light>();
        directionalLight.type = LightType.Directional;

        directionalLight.color = Color.white;
        directionalLight.intensity = 1;

        lightGameObject.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
      }
    }

    void OnEnable()
    {
      SceneManager.sceneLoaded += OnSceneLoaded;
    }

    void OnDisable()
    {
      SceneManager.sceneLoaded -= OnSceneLoaded;
    }

    private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
    {
      InitializeDirectionalLight();
    }
  }
}
