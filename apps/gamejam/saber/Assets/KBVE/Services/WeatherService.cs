using System;
using KBVE.Events;
using KBVE.Services;
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

    private IClockService clockService;

    // [SerializeField]
    // private float dayLengthInSeconds = 1200f;
    // private float currentTimeOfDay = 0f;

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

    private void Start()
    {
      clockService = Services.Instance.GetService<IClockService>();
      if (clockService != null)
      {
        clockService.SubscribeToTick(OnTick);
      }
    }

    private void OnDestroy()
    {
      if (clockService != null)
      {
        clockService.UnsubscribeFromTick(OnTick);
      }
    }

    private void OnTick(float currentTime)
    {
      UpdateLightingBasedOnTimeOfDay();
    }



    private void UpdateLightingBasedOnTimeOfDay()
    {
      if (directionalLight == null || clockService == null) return;



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
