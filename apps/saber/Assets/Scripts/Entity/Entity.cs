using TMPro;
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

  public Canvas EntityCanvas
  {
    get { return entityCanvas; }
    set { entityCanvas = value; }
  }

  private Image healthBar;
  public Image HealthBar
  {
    get { return healthBar; }
    set { healthBar = value; }
  }

  private TextMeshProUGUI healthBarText;
  public TextMeshProUGUI HealthBarText
  {
    get { return healthBarText; }
    set { healthBarText = value; }
  }

  private Image manaBar;
  public Image ManaBar
  {
    get { return manaBar; }
    set { manaBar = value; }
  }

  private TextMeshProUGUI manaBarText;
  public TextMeshProUGUI ManaBarText
  {
    get { return manaBarText; }
    set { manaBarText = value; }
  }

  private Image energyBar;
  public Image EnergyBar
  {
    get { return energyBar; }
    set { energyBar = value; }
  }

  private TextMeshProUGUI energyBarText;
  public TextMeshProUGUI EnergyBarText
  {
    get { return energyBarText; }
    set { energyBarText = value; }
  }

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
  public int MaxHealth { get; protected set; }
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
    //InitializeStatusBar();
  }

  private void InitializeCamera()
  {
    MainCamera = Camera.main;
  }

  protected virtual void InitializeEntity()
  {
    Name = "Entity"; // Default Name (as Entity)
    MaxHealth = 100;
    MaxMana = 50;
    Energy = 100;
    Health = MaxHealth;
    Mana = MaxMana;
    Strength = 10;
    Agility = 10;
    Intelligence = 10;
    Position = transform.position;
    Experience = 0; // Default experience
    Reputation = 0; // Default reputation
  }

  public void InitializeEntityCanvas(Vector3 canvasPosition)
  {
    if (EntityCanvas == null)
    {
      EntityCanvas = UI.CreateCanvas(
        this.gameObject,
        canvasPosition, // Use the passed-in canvasPosition here
        new Vector2(2, 1),
        this.MainCamera
      );
    }
  }

  public void InitializeHealthBar(Vector3 healthBarPosition)
  {
    if (EntityCanvas != null)
    {
      if (HealthBar == null)
      {
        (HealthBar, HealthBarText) = UI.CreateBar(
          entityCanvas,
          "HealthBar",
          Color.red,
          healthBarPosition, //new Vector2(0, 0),
          new Vector2(2f, 0.2f),
          this.Health.ToString(),
          false
        );
      }
    }
  }

  public void InitializeManaBar(Vector3 manaBarPosition)
  {
    if (EntityCanvas != null)
    {
      if (ManaBar == null)
      {
        (ManaBar, ManaBarText) = UI.CreateBar(
          entityCanvas,
          "ManaBar",
          Color.blue,
          manaBarPosition, // new Vector2(0, -0.3f),
          new Vector2(2f, 0.2f),
          this.Mana.ToString(),
          false
        );
      }
    }
  }

  public void InitializeEnergyBar(Vector3 energyBarPosition)
  {
    if (EntityCanvas != null)
    {
      if (EnergyBar == null)
      {
        (EnergyBar, EnergyBarText) = UI.CreateBar(
          entityCanvas,
          "EnergyBar",
          Color.yellow,
          energyBarPosition, // new Vector2(0, -0.6f),
          new Vector2(2f, 0.2f),
          this.Energy.ToString(),
          false
        );
      }
    }
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
