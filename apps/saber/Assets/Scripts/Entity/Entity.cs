using Cinemachine;
using UnityEngine;
using UnityEngine.AI;

public class Entity : MonoBehaviour
{
  #region Entity


  //TODO Energy Implementation
  public int energy;

  //TODO Debug Entity



  #region Camera
  protected Camera mainCamera;
  public CinemachineVirtualCamera virtualCamera;
  #endregion

  #region Types

  public string Name { get; set; } // Adding a Name property

  private bool _debugMode = false;
  public bool DebugMode
  {
    get { return _debugMode; }
    set { _debugMode = value; }
  }

  public enum EntityType
  {
    Player,
    NPC,
    Boss
  }

  private EntityType entityType = EntityType.NPC;

  public EntityType Type
  {
    get => entityType;
    set
    {
      entityType = value;
      //OnEntityTypeChanged();
    }
  }

  #endregion

  #region Health
  private int health;
  private EntityHealthBar healthBar;
  public int Health
  {
    get => health;
    set
    {
      health = Mathf.Max(0, value);
      if (health <= 0)
      {
        Die();
      }
      UpdateHealthBar();
    }
  }

  #endregion

  #region Mana
  private int mana;
  public int Mana
  {
    get => mana;
    protected set => mana = Mathf.Max(0, Mathf.Min(value, MaxMana));
  }
  #endregion

  #region  Movement
  private Vector3 _position;
  public Vector3 Position
  {
    get => _position;
    set => _position = value;
  }
  private NavMeshAgent navMeshAgent;
  private float _moveSpeed = 5f;
  public float MoveSpeed
  {
    get => _moveSpeed;
    set
    {
      _moveSpeed = value;
      if (navMeshAgent != null)
      {
        navMeshAgent.speed = _moveSpeed; // Update the NavMeshAgent's speed
      }
    }
  }

  #endregion

  #region  Stats
  public int MaxMana { get; protected set; }
  public int Strength { get; protected set; }
  public int Agility { get; protected set; }
  public int Intelligence { get; protected set; }
  public int Experience { get; protected set; }
  public int Reputation { get; protected set; }

  #endregion

  #endregion


  #region Core

  void Start() { }

  void Update() { }
  #endregion

  #region Cycles



  #endregion

  #region Initialization


  public void Initialization()
  {
    InitializeEntity();
    InitializeCamera();
    InitializeNavMeshAgent();
    InitializeHealthBar();
  }

  private void InitializeCamera()
  {
    mainCamera = Camera.main;

    virtualCamera = FindObjectOfType<CinemachineVirtualCamera>();
  }

  protected virtual void InitializeEntity()
  {
    //TODO Minor tweaks to the initialization.
    // Default values
    Name = "Entity"; // Default name
    Health = 100;
    MaxMana = 50;
    Mana = MaxMana;
    Strength = 10;
    Agility = 10;
    Intelligence = 10;
    Position = transform.position;
    Experience = 0; // Default experience
    Reputation = 0; // Default reputation
  }

  private void InitializeHealthBar()
  {
    healthBar = gameObject.AddComponent<EntityHealthBar>(); // Add HealthBar component
    healthBar.InitializeHealthBar();
  }

  private void InitializeNavMeshAgent()
  {
    navMeshAgent = GetComponent<NavMeshAgent>();
    if (navMeshAgent == null)
    {
      navMeshAgent = gameObject.AddComponent<NavMeshAgent>();
    }

    if (navMeshAgent != null)
    {
      navMeshAgent.speed = MoveSpeed;
    }

  }

  #endregion

  #region Movement

  public virtual void Move(Vector3 targetPosition)
  {
    if (navMeshAgent != null)
    {
      navMeshAgent.SetDestination(targetPosition);
    }
  }

  #endregion

  #region Combat

  public virtual void TakeDamage(int amount)
  {
    //TODO Debuffs / Enchants
    Health -= amount;
    if (Health <= 0)
    {
      OnDeath();
    }
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

  private void UpdateHealthBar()
  {
    if (healthBar != null)
    {
      float healthNormalized = (float)health; // Health (Int) to Float
      healthBar.SetHealth(healthNormalized);
    }
  }

  private void Die()
  {
    Debug.Log("[Entity] -> Die");
    //TODO: Callback to Pool
  }

  public void OnDeath()
  {
    Debug.Log("[Entity] -> Death");
    Die();
  }

  #endregion
}
