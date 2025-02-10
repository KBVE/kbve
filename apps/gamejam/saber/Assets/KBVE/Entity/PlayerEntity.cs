using System;
using UnityEngine;
using KBVE.Services;

namespace KBVE.Entity
{
  public class PlayerEntity : BaseEntity
  {
    public void ApplyCharacterData(Character character)
    {
      if (character == null)
      {
        Debug.LogError("Character data is null. Cannot apply to PlayerEntity");
        return;
      }

      try
      {
        MaxHealth = character.hp;
        MaxMana = character.mp;
        MaxEnergy = character.ep;
        Health = character.health;
        Mana = character.mana;
        Energy = character.energy;
        Strength = character.strength;
        Agility = character.agility;
        Intelligence = character.intelligence;
        Experience = character.experience;
        Reputation = character.reputation;
        Debug.Log($"Character data successfully applied to {gameObject.name}");
      }
      catch (Exception e)
      {
        Debug.LogError($"Error applying character data to PlayerEntity: {e.Message}");
      }
    }
  }
}
