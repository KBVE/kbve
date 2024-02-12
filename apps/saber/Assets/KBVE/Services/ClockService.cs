using System;
using UnityEngine;

namespace KBVE.Services
{
  public interface IClockService
  {
    float CurrentTime { get; }
    float TimeScale { get; set; }

    event Action<float> OnTick;

    void SubscribeToTick(Action<float> tickAction);
    void UnsubscribeFromTick(Action<float> tickAction);

    float DayLengthInSeconds { get; }
    float CurrentDayTime { get; }
    bool IsDaytime { get; }
  }

  public class ClockService : MonoBehaviour, IClockService
  {
    public static ClockService Instance { get; private set; }

    public float CurrentTime { get; private set; }
    public float TimeScale { get; set; } = 1.0f;

    public event Action<float> OnTick;

    private float tickRate = 1.0f; // How often the tick event is called, in seconds.
    private float nextTickTime = 0f;

    [SerializeField]
    private float dayLengthInSeconds = 1200f; // Total length of a day in real-time seconds
    public float DayLengthInSeconds => dayLengthInSeconds;

    public float CurrentDayTime => CurrentTime % DayLengthInSeconds;
    public bool IsDaytime => CurrentDayTime >= SunriseTime && CurrentDayTime < SunsetTime;


    public float SunriseTime { get; private set; }
    public float SunsetTime { get; private set; }

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

                    // Initialize sunrise and sunset times here
            SunriseTime = dayLengthInSeconds * 0.25f;
            SunsetTime = dayLengthInSeconds * 0.75f;
      }
    }

    private void Update()
    {
      CurrentTime += Time.deltaTime * TimeScale;

      if (CurrentTime >= nextTickTime)
      {
        OnTick?.Invoke(CurrentDayTime);
        nextTickTime += tickRate;
      }
    }

    public void SubscribeToTick(Action<float> tickAction)
    {
      OnTick += tickAction;
    }

    public void UnsubscribeFromTick(Action<float> tickAction)
    {
      OnTick -= tickAction;
    }
  }
}
