using System;

namespace KBVE.Events
{
  public static class WeatherEvents
  {
    public static event Action onDayStarted;
    public static event Action onNightStarted;
    public static event Action onRainStarted;
    public static event Action onRainStopped;

    public static void TriggerDayStarted() => onDayStarted?.Invoke();

    public static void TriggerNightStarted() => onNightStarted?.Invoke();

    public static void TriggerRainStarted() => onRainStarted?.Invoke();

    public static void TriggerRainStopped() => onRainStopped?.Invoke();
  }
}
