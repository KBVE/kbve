using System;
using UnityEngine;

namespace KBVE.Entity
{
  public interface IPoolable
  {
    void ResetComponent();
  }

  public class BaseEntity : MonoBehaviour, IPoolable
  {
    protected EntityCombat combatComponent;

    public enum EntityType
    {
      Player,
      NPC,
      Boss
    }

    [SerializeField]
    private EntityType entityType = EntityType.NPC;

    // Property to get/set the entity type
    public EntityType Type
    {
      get => entityType;
      set
      {
        if (entityType != value)
        {
          entityType = value;
          OnEntityTypeChanged(); // Notify about the entity type change
        }
      }
    }

    public int MaxHealth { get; protected set; } = 100;
    public int MaxMana { get; protected set; } = 100;
    public int MaxEnergy { get; protected set; } = 100;
    public int Armour { get; protected set; }
    public int Strength { get; protected set; }
    public int Agility { get; protected set; }
    public int Intelligence { get; protected set; }
    public int Experience { get; protected set; }
    public int Reputation { get; protected set; }

    [SerializeField]
    private int health;
    public int Health
    {
      get => health;
      set
      {
        int newHealth = Mathf.Clamp(value, 0, MaxHealth);
        if (health != newHealth)
        {
          health = newHealth;
          OnHealthChanged();
          if (health <= 0)
          {
            OnDeath();
          }
        }
      }
    }

    [SerializeField]
    private int mana;
    public int Mana
    {
      get => mana;
      protected set
      {
        mana = Mathf.Clamp(value, 0, MaxMana);
        OnManaChanged();
      }
    }

    [SerializeField]
    private int energy;
    public int Energy
    {
      get => energy;
      set
      {
        energy = Mathf.Clamp(value, 0, MaxEnergy);
        OnEnergyChanged();
      }
    }

    // ! Hooks

    // TODO Event System Hook, leaving this function here for test casing and debugging those issues.
    // Placeholder method for handling entity type changes
    protected virtual void OnEntityTypeChanged()
    {
      Debug.Log($"Entity type changed to: {entityType}");
      // Implement behavior based on the entity type change, if necessary
    }

    protected virtual void OnHealthChanged()
    {
      // Update health bar or other related UI elements
    }

    protected virtual void OnManaChanged()
    {
      // Update mana bar or other related UI elements
    }

    protected virtual void OnEnergyChanged()
    {
      // Update energy bar or other related UI elements
    }

    protected virtual void OnDeath()
    {
      // Handle death logic (e.g., play animation, notify game manager)
      Debug.Log($"{gameObject.name} has died.");
    }

    protected virtual void Awake()
    {
      combatComponent = GetComponent<EntityCombat>();
      if (combatComponent == null)
      {
        combatComponent = gameObject.AddComponent<EntityCombat>();
      }
    }


    // ? Remember inside a derived component, like NPC/Boss, we want to override this virtual void.

    public virtual void ResetComponent()
    {
      Health = MaxHealth;
      Mana = MaxMana;
      Energy = MaxEnergy;
      EntityCombat combatComponent = GetComponent<EntityCombat>();
      if (combatComponent != null)
      {
        combatComponent.ResetCombatState();
      }

      // Debug Log
      Debug.Log($"{gameObject.name} has been reset.");
    }
  }
}
