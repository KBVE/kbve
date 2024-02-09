using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace KBVE.Services
{
  [Serializable]
  public class UserData
  {
    public string Email;
    public string CaptainName;
    public int Reputation;
    public int Experience;
    public List<Character> Characters = new List<Character>();
  }

  [Serializable]
  public class CharacterResponse
  {
    public CharacterData data;
    public string message;
    public string status;
    public int status_code;
  }

  [Serializable]
  public class CharacterData
  {
    public List<Character> characters;
  }

  [Serializable]
  public class Character
  {
    public int agility;
    public int armour;
    public List<int> cid; // CID as List<int> to ULID
    public string description;
    public int energy;
    public int ep; // Assuming energy points
    public int experience;
    public int faith;
    public int health;
    public int hp; // Assuming hit points
    public int id;
    public int intelligence;
    public int mana;
    public int mp; // Assuming mana points
    public string name;
    public int reputation;
    public int strength;
    public List<int> userid; // UserID as List<int> to ULID
  }

  public interface IUserDataService
  {
    void SetUserData(UserData userData);
    UserData GetUserData();
    void SetToken(string jwt);
    string GetToken();

    //  02-08-2024
    void SetCaptainName(string captainName);
    void SetReputation(int level);
    void SetExperience(int experience);

    //  02-08-2024 CONT.
    void UpdateCharacterData(List<Character> characters);
    List<Character> ListCharacters();
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

    public void SetCaptainName(string captainName)
    {
      if (_userData != null)
      {
        _userData.CaptainName = captainName;
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

    public void UpdateCharacterData(List<Character> characters)
    {
      if (_userData != null)
      {
        _userData.Characters = characters;
      }
    }

    public List<Character> ListCharacters()
    {
        if (_userData != null && _userData.Characters != null)
        {
            return _userData.Characters;
        }
        return new List<Character>(); // Return an empty list if no characters are available
    }


  }
}
