using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;

public class Entity : MonoBehaviour
{
  #region Entity



  #region Camera
  protected Camera mainCamera;
  public Camera MainCamera
  {
    get
    {
      if (mainCamera == null)
      {
        mainCamera = Camera.main;
      }
      return mainCamera;
    }
    set { mainCamera = value; }
  }

  #endregion

  #region Types

  private string _name;
  public string Name
  {
    get { return _name; }
    set { _name = value; }
  }

  private string _guild;
  public string Guild
  {
    get { return _guild; }
    set { _guild = value; }
  }

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

  #region EntityUI

  private Canvas entityCanvas;
  private Image healthBar;
  private Image manaBar;
  private Image energyBar;

  #endregion

  #region Health
  private int health;
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

  #region Energy

  private int energy;
  public int Energy
  {
    get { return energy; }
    set { energy = value; }
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

  void LateUpdate()
  {
    if (this.Type == EntityType.Player && entityCanvas != null)
    {
      entityCanvas.transform.localRotation = Quaternion.Euler(0, 180, 0); // Example local rotation
    }
  }
  #endregion

  #region Cycles



  #endregion

  #region Initialization


  public void Initialization()
  {
    InitializeEntity();
    InitializeCamera();
    InitializeNavMeshAgent();
    InitializeStatusBar();
  }

  private void InitializeCamera()
  {
    MainCamera = Camera.main;
  }

  protected virtual void InitializeEntity()
  {
    Name = "Entity"; // Default name
    Health = 100;
    MaxMana = 50;
    Energy = 100;
    Mana = MaxMana;
    Strength = 10;
    Agility = 10;
    Intelligence = 10;
    Position = transform.position;
    Experience = 0; // Default experience
    Reputation = 0; // Default reputation
  }

  private void InitializeStatusBar()
  {
    switch (this.Type)
    {
      case EntityType.NPC:
        entityCanvas = UI.CreateCanvas(
          this.gameObject,
          new Vector3(0, 2.5f, 0),
          new Vector2(2, 1),
          this.MainCamera
        );
        break;

      case EntityType.Player:
        entityCanvas = UI.CreateCanvas(
          this.gameObject,
          new Vector3(0, 2f, 0),
          new Vector2(2, 1),
          this.MainCamera
        );
        break;

      case EntityType.Boss:
        entityCanvas = UI.CreateCanvas(
          this.gameObject,
          new Vector3(0, 2f, 0),
          new Vector2(2, 1),
          this.MainCamera
        );
        break;
    }

    healthBar = UI.CreateBar(
      entityCanvas,
      "HealthBar",
      Color.red,
      new Vector2(0, 0),
      new Vector2(2f, 0.2f),
      this.Health.ToString()
    );
    manaBar = UI.CreateBar(
      entityCanvas,
      "ManaBar",
      Color.blue,
      new Vector2(0, -0.3f),
      new Vector2(2f, 0.2f),
      this.Mana.ToString()
    );
    energyBar = UI.CreateBar(
      entityCanvas,
      "EnergyBar",
      Color.yellow,
      new Vector2(0, -0.6f),
      new Vector2(2f, 0.2f),
      this.Energy.ToString()
    );
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
    // if (healthBar != null)
    // {
    //   float healthNormalized = (float)health; // Health (Int) to Float
    //    healthBar.SetHealth(healthNormalized);
    // }
  }

  private void Die()
  {
    Debug.Log("[Entity] -> Die");
    //TODO: Callback to Pool if Type == NPC
    //TODO: RogueLike Option
  }

  public void OnDeath()
  {
    Debug.Log("[Entity] -> Death");
    Die();
  }

  #endregion
}
