using UnityEngine;

namespace KBVE.Services
{
  [System.Serializable]
  public class UserData
  {
    public string Email;
    public string CharacterName;
    public int Level;
    public float Experience;
  }

  public interface IUserDataService
  {
    void SetUserData(UserData userData);
    UserData GetUserData();
    void SetToken(string jwt);
    string GetToken();
  }

  public class UserDataService : MonoBehaviour, IUserDataService
  {
    public static UserDataService Instance { get; private set; }

    private UserData _userData;
    private string _jwt;

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
      }
    }

    public void SetUserData(UserData userData)
    {
      _userData = userData;
    }

    public UserData GetUserData()
    {
      return _userData;
    }

    public void SetToken(string jwt)
    {
      _jwt = jwt;
    }

    public string GetToken()
    {
      return _jwt;
    }
  }
}
