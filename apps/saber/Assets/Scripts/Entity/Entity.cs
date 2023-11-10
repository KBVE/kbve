using UnityEngine;
using UnityEngine.AI;

public class Entity : MonoBehaviour
{
  #region Entity
  private int health;
  private int mana;
  public int energy;
  public float speed;
  public Vector3 position;
  private NavMeshAgent navMeshAgent;

  //? Name

  public string Name { get; set; } // Adding a Name property

  //? Health
  public int Health
  {
    get => health;
    protected set => health = Mathf.Max(0, value);
  }

  //? Mana
  public int Mana
  {
    get => mana;
    protected set => mana = Mathf.Max(0, Mathf.Min(value, MaxMana));
  }

  //? Stats
  public int MaxMana { get; protected set; }
  public int Strength { get; protected set; }
  public int Agility { get; protected set; }
  public int Intelligence { get; protected set; }
  public int Experience { get; protected set; }
  public int Reputation { get; protected set; }

  #endregion

  void Start()
  {
    InitializeEntity();
    navMeshAgent = GetComponent<NavMeshAgent>();
    if (navMeshAgent == null)
    {
      navMeshAgent = gameObject.AddComponent<NavMeshAgent>(); // Add a NavMeshAgent component if not already attached
    }

    navMeshAgent.speed = speed;
  }

  void Update() { }

  protected virtual void InitializeEntity()
  {
    // Default values
    Name = "Entity"; // Default name
    Health = 100;
    MaxMana = 50;
    Mana = MaxMana;
    Strength = 10;
    Agility = 10;
    Intelligence = 10;
    speed = 5f;
    position = transform.position;
    Experience = 0; // Default experience
    Reputation = 0; // Default reputation
  }

  public virtual void Move(Vector3 targetPosition) {
      if (navMeshAgent != null)
        {
            navMeshAgent.SetDestination(targetPosition);
        }
   }

  public virtual void TakeDamage(int amount)
  {
    //TODO Debuffs / Enchants
    Health -= amount;
  }

  public virtual void Heal(int amount)
  {
    //TODO Heal Regen
    Health += amount;
  }

  public virtual void UseMana(int amount)
  {
    Mana -= amount;
  }

  public virtual void RestoreMana(int amount)
  {
    Mana += amount;
  }

  public void GainExperience(int amount)
  {
    Experience += amount;
  }

  public void ChangeReputation(int amount)
  {
    Reputation += amount;
  }
}
