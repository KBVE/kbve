//*      [IMPORTS]
using UnityEngine;
using UnityEngine.SceneManagement;

public class Player : Entity
{
  #region Player-Variables

  public static Player Instance { get; private set; }
  public string CurrentScene => SceneManager.GetActiveScene().name;

  public Camera PlayerCamera => this.MainCamera;

  #endregion


  #region Player-Core

  public void PlayerDebug()
  {
    if (this.DebugMode)
    {
      Debug.Log("Current Player Health " + this.Health);
      Debug.Log("Current Player Mana Pool " + this.Mana);
      Debug.Log("Current Type " + this.Type);
    }
  }

  // Ensure there is only one instance of this class in the game + checks
  private void Awake()
  {
    if (Instance == null)
    {
      Instance = this;
      DontDestroyOnLoad(gameObject); // Persist across scenes
    }
    else
    {
      Destroy(gameObject);
    }
  }

  protected virtual void Start()
  {
    this.Type = EntityType.Player;
    base.Initialization();
    base.InitializeEntityCanvas(new Vector3(0, 1f, 0));
    base.InitializeHealthBar(new Vector2(0, 0));
    base.InitializeEnergyBar(new Vector2(0, -0.3f));

    PlayerDebug();
  }

  protected virtual void LateUpdate()
  {
    base.FlipCanvas();
  }


  #endregion



  #region Player-Combat

  private bool CanAttack(Entity targetEntity)
  {
      return !this.Guild.Equals(targetEntity.Guild, System.StringComparison.OrdinalIgnoreCase);
  }

  #endregion


  #region EntityUI


  #region EntityMana



  #endregion

  #endregion
}
