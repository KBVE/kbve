using System.IO;
using Supabase.Gotrue;
using Supabase.Gotrue.Interfaces;
using UnityEngine;

namespace KBVE.Kilonet.Utils
{
  public class CustomSupabaseSessionHandler : IGotrueSessionPersistence<Session>
  {
    private readonly string _cacheFilePath = Path.Combine(
      Application.persistentDataPath,
      "supabase_session.json"
    );


    public void SaveSession(Session session)
    {
      try
      {
        var json = JsonUtility.ToJson(session);
        File.WriteAllText(_cacheFilePath, json);
        Debug.Log($"Session saved to: {_cacheFilePath}");
      }
      catch (IOException ex)
      {
        Debug.LogError($"Failed to save session: {ex.Message}");
      }
    }

    public Session LoadSession()
    {
      try
      {
        if (!File.Exists(_cacheFilePath))
        {
          Debug.LogWarning("Session file not found.");
          return null;
        }

        var json = File.ReadAllText(_cacheFilePath);
        var session = JsonUtility.FromJson<Session>(json);
        Debug.Log("Session loaded successfully.");
        return session;
      }
      catch (IOException ex)
      {
        Debug.LogError($"Failed to load session: {ex.Message}");
        return null;
      }
    }

    public void DestroySession()
    {
      try
      {
        if (File.Exists(_cacheFilePath))
        {
          File.Delete(_cacheFilePath);
          Debug.Log("Session destroyed successfully.");
        }
      }
      catch (IOException ex)
      {
        Debug.LogError($"Failed to destroy session: {ex.Message}");
      }
    }
  }
}
