using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;

public class Entity : MonoBehaviour
{
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



  #region Radar

  private GameObject _target;
  public GameObject Target
  {
    get => _target;
    set { _target = value; }
  }

  private float _naturalDetectionRange;
  public float NaturalInstinct
  {
    get => _naturalDetectionRange;
    set { _naturalDetectionRange = value + Agility; }
  }

  private LayerMask _enemyLayer;
  public LayerMask NPCLayer
  {
    get => _enemyLayer;
    set { _enemyLayer = value; }
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


  #region Movement
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

  #region Stats

  private int health;
  public int Health
  {
    get => health;
    set
    {
      health = Mathf.Max(0, Mathf.Min(value, MaxHealth));
      if (health <= 0)
      {
        OnDeath();
      }
      UpdateHealthBar();
    }
  }

  private int mana;
  public int Mana
  {
    get => mana;
    protected set
    {
      mana = Mathf.Max(0, Mathf.Min(value, MaxMana));
      UpdateManaBar();
    }
  }

  private int energy;
  public int Energy
  {
    get => energy;
    set
    {
      energy = Mathf.Max(0, Mathf.Min(value, MaxEnergy));
      UpdateEnergyBar();
    }
  }

  public int MaxHealth { get; protected set; }
  public int MaxMana { get; protected set; }
  public int MaxEnergy { get; protected set; }
  public int Armour { get; protected set; }
  public int Strength { get; protected set; }
  public int Agility { get; protected set; }
  public int Intelligence { get; protected set; }
  public int Experience { get; protected set; }
  public int Reputation { get; protected set; }

  public enum CombatState
  {
    Idle,
    Engaged,
    Alert,
    Support,
    War
  }

  private CombatState _currentCombatState;

  public CombatState EntityCombatState
  {
    get { return _currentCombatState; }
    set { _currentCombatState = value; }
  }

  public event Action<CombatState> OnCombatStateChanged;

  #endregion


  #region Cycles

  private Coroutine EntityLifeCycleReference;

  public void InitializeLifeCycle()
  {
    if (EntityLifeCycleReference == null)
    {
      EntityLifeCycleReference = StartCoroutine(EntityLifeCycle);
    }
  }

  public void HaltLifeCycle()
  {
    if (EntityLifeCycleReference != null)
    {
      StopCoroutine(EntityLifeCycleReference);
      EntityLifeCycleReference = null;
    }
  }

  private IEnumerator EntityLifeCycle()
  {
    while (true)
    {
      yield return null;
    }
  }

  #endregion

  #region Initialization


  public void Initialization()
  {
    InitializeEntity();
    InitializeCamera();
    InitializeNavMeshAgent();
    InitializeLifeCycle();
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
    MaxEnergy = 100;
    Armour = 10;
    Health = MaxHealth;
    Mana = MaxMana;
    Energy = MaxEnergy;
    NaturalInstinct = 1; // Natural Radar with a base of 1.
    Strength = 10;
    Agility = 10;
    Intelligence = 10;
    Position = transform.position;
    Experience = 0; // Default experience
    Reputation = 0; // Default reputation
  }

  public void InitializeTarget(GameObject _target)
  {
    if (Target == null)
    {
      Target = _target;
    }
  }

  public void SetEntityName(string _name)
  {
    Name = _name;
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

  #region Movement/Camera

  public virtual void Move(Vector3 targetPosition)
  {
    if (navMeshAgent != null)
    {
      navMeshAgent.SetDestination(targetPosition);
    }
    if (navMeshAgent == null)
    {
      NavAgentBrokenFollowTarget();
    }
  }

  public bool IsInRangeOf(GameObject target)
  {
    if (target != null)
    {
      return Vector3.Distance(Position, target.transform.position) < NaturalInstinct;
    }
    else
    {
      return false;
    }
  }

  private bool RadarDetectEnemies()
  {
    // Check if the target is null or out of range
    if (Target == null || !IsInRangeOf(Target))
    {
      return false;
    }

    Debug.Log("Radar is Running");

    // Perform the raycast
    Ray ray = new Ray(transform.position, transform.forward);
    if (Physics.Raycast(ray, out RaycastHit hit, NaturalInstinct, NPCLayer))
    {
      if (hit.collider.gameObject == Target)
      {
        Debug.Log("[Radar] -> Target Found");
        return true;
      }
    }

    // Return false if the raycast didn't hit the target or no target was found
    return false;
  }

  public virtual void FlipCanvas()
  {
    if (EntityCanvas != null)
    {
      EntityCanvas.transform.localRotation = Quaternion.Euler(0, 360, 0);
    }
  }

  #endregion

  #region Combat

  public void ToggleCombatState()
  {
    switch (_currentCombatState)
    {
      case CombatState.Idle:
      case CombatState.Alert:
        SetCombatState(CombatState.Engaged);
        break;

      case CombatState.Engaged:
        SetCombatState(CombatState.Alert);
        break;

      default:
        SetCombatState(CombatState.Idle);
        break;
    }
  }

  private void SetCombatState(CombatState _newState)
  {
    if (CanCombatTransitionTo(_newState))
    {
      EntityCombatState = _newState;
      OnCombatStateChanged?.Invoke(_newState);
      // HandleCombatStateTransitionEffects(_newState);
      Debug.Log($"Combat state was changed to: {EntityCombatState}");
    }
  }

  private bool CanCombatTransitionTo(CombatState _newState)
  {
    // If Entity is in War state, it will not change.
    if (EntityCombatState == CombatState.War)
    {
      return false;
    }
    return true;
  }

  public virtual void MigrateDamage(int baseAmount)
  {
    int final = baseAmount - Armour;
    TakeDamage(final);
  }

  public virtual void TakeDamage(int amount)
  {
    Health = DegenerateStat(Health, amount);
  }

  public virtual void Heal(int amount)
  {
    Health = RegenerateStat(Health, amount);
  }

  public virtual void UseMana(int amount)
  {
    Mana = DegenerateStat(Mana, amount);
  }

  public virtual void RestoreMana(int amount)
  {
    Mana = RegenerateStat(Mana, amount);
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
    if (HealthBar != null && HealthBarText != null)
    {
      UI.UpdateStatsBar(Health, MaxHealth, HealthBar, HealthBarText);
      Debug.Log("Updated HealthBar");
    }
  }

  private void UpdateManaBar()
  {
    if (ManaBar != null && ManaBarText != null)
    {
      UI.UpdateStatsBar(Mana, MaxMana, ManaBar, ManaBarText);
      Debug.Log("Updated ManaBar");
    }
  }

  private void UpdateEnergyBar()
  {
    if (EnergyBar != null && EnergyBarText != null)
    {
      UI.UpdateStatsBar(Energy, MaxEnergy, EnergyBar, EnergyBarText);
      Debug.Log("Updated EnergyBar");
    }
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

  #region Timers

  private int RegenerateStat(int stat, int statAmount)
  {
    int newStat = stat + statAmount;
    return newStat;
  }

  private int DegenerateStat(int stat, int statAmount)
  {
    int newStat = stat - statAmount;
    return newStat;
  }

  #endregion


  #region FallBacks

  //* Incase NavAgent is Broken

  public void NavAgentBrokenFollowTarget()
  {
    Debug.Log("NavAgent is missing ; Using FallBack");
  }

  #endregion
}
