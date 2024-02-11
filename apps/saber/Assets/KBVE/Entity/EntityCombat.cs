using System;
using UnityEngine;

namespace KBVE.Entity
{
  public class EntityCombat : MonoBehaviour
  {
    public enum CombatState
    {
      Idle,
      Engaged,
      Alert,
      Support,
      War
    }

    [SerializeField]
    private CombatState _currentCombatState;

    public CombatState CurrentCombatState
    {
      get => _currentCombatState;
      set
      {
        if (_currentCombatState != value)
        {
          _currentCombatState = value;
          OnCombatStateChanged?.Invoke(_currentCombatState);
        }
      }
    }

    public event Action<CombatState> OnCombatStateChanged;

    // Example method to demonstrate changing the combat state
    public void ChangeCombatState(CombatState newState)
    {
      CurrentCombatState = newState;
      // Implement additional logic for state change if necessary
    }

    // Combat-related methods such as TakeDamage, Heal, etc.
  }
}
