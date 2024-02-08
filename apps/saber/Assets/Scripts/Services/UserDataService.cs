using UnityEngine;

namespace KBVE.Services
{
  [System.Serializable]
  public class UserData
  {
    public string Email;
    public string CharacterName;
    public int Reputation;
    public int Experience;
  }

  public interface IUserDataService
  {
    void SetUserData(UserData userData);
    UserData GetUserData();
    void SetToken(string jwt);
    string GetToken();

    //  02-08-2024
    void SetCharacterName(string characterName);
    void SetReputation(int level);
    void SetExperience(int experience);
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

    public void SetCharacterName(string characterName)
    {
      if (_userData != null)
      {
        _userData.CharacterName = characterName;
      }
    }

    public void SetReputation(int reputation)
    {
      if (_userData != null)
      {
        _userData.Reputation = reputation;
      }
    }

    public void SetExperience(int experience)
    {
      if (_userData != null)
      {
        _userData.Experience = experience;
      }
    }
  }
}
