using System;

namespace KBVE.Events
{
  public static class GlobalEvents
  {
    public static event Action<GameEventArgs> OnGameStart;
    public static event Action<GameEventArgs> OnGameOver;
    public static event Action<ScoreChangedEventArgs> OnScoreChanged;

    public static void TriggerGameStart()
    {
      var args = new GameEventArgs();
      OnGameStart?.Invoke(args);
      EventUtils.LogEventTrigger("GameStart");
    }

    public static void TriggerGameOver()
    {
      var args = new GameEventArgs();
      OnGameOver?.Invoke(args);
      EventUtils.LogEventTrigger("GameOver");
    }

    // ! Example of the Score Change -> REMOVE BEFORE STEAM LAUNCH
    public static void TriggerScoreChanged(int oldScore, int newScore)
    {
      var args = new ScoreChangedEventArgs(oldScore, newScore);
      OnScoreChanged?.Invoke(args);
      EventUtils.LogEventTrigger("ScoreChanged");
    }
  }


  //  ! Example of the Score Change -> REMOVE BEFORE STEAM LAUNCH
  public class ScoreChangedEventArgs : GameEventArgs
  {
    public int OldScore { get; private set; }
    public int NewScore { get; private set; }

    public ScoreChangedEventArgs(int oldScore, int newScore)
    {
      OldScore = oldScore;
      NewScore = newScore;
    }
  }
}
