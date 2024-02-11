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

    public void ChangeCombatState(CombatState newState)
    {
       if (_currentCombatState != newState)
        {
            _currentCombatState = newState;
            OnCombatStateChanged?.Invoke(_currentCombatState);
        }
    }

    public void ResetCombatState()
    {
      ChangeCombatState(CombatState.Idle);
      Debug.Log("Combat state has been reset to Idle.");

    }

  }
}
