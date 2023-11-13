//*       [IMPORTS]
using UnityEngine;
using UnityEngine.UI;

public class NPC : Entity
{
  #region NPC
  public NPCData npcData; // Data object holding NPC properties
  public NPCPoolManager poolManager; // Manager handling pooling of NPCs
  public NPCAbilities abilities; // Script managing NPC abilities

  //TODO  Migration of 2 variables below.
  //public Vector3 location; // Current location of the NPC
  public bool isFriendly; // Flag indicating if the NPC is friendly or not
  private Transform target; // Reference to the target (player)
  private SpriteRenderer spriteRenderer; // Sprite Renderer for the NPC
  private Vector3 initialPosition;

  #endregion

  #region NPC-Core

  private void Awake()
  {
    spriteRenderer = GetComponent<SpriteRenderer>();
    if (spriteRenderer == null)
    {
      if (this.DebugMode)
      {
        Debug.LogError("SpriteRenderer component is missing on this GameObject.", this);
      }
    }
    if (Camera.main == null)
    {
      if (this.DebugMode)
      {
        Debug.LogError("Main Camera is missing in the scene.", this);
      }
    }

    initialPosition = transform.position;
  }

  protected virtual void Start()
  {
    base.Initialization();
    //! REMOVE
    //! Debug Log
    Debug.Log("Current NPC Health " + this.Health);
    Debug.Log("Current Mana Pool " + this.Mana);
    Debug.Log("Current Type " + this.Type);
    abilities = GetComponent<NPCAbilities>(); // Initialize abilities
  }

  protected virtual void Update()
  {
    if (spriteRenderer == null || Camera.main == null)
    {
      return;
    }

    this.Position = transform.position; // Update location each frame

    transform.rotation = Quaternion.Euler(0f, Camera.main.transform.rotation.eulerAngles.y, 0f);

    FlipSpriteBasedOnViewpoint();
  }

  #endregion

  #region NPC-Render

  private void FlipSpriteBasedOnViewpoint()
  {
    Vector3 toCamera = Camera.main.transform.position - transform.position;
    bool shouldFlip = Vector3.Dot(toCamera, transform.right) < 0f;
    spriteRenderer.flipX = shouldFlip;
  }

  #endregion

  #region NPC-Combat

  public void ReceiveDamage(int damage)
  {
    int _damage = Mathf.Max(0, damage - npcData.defensePower); // Apply damage to NPC, considering defense power
    base.TakeDamage(_damage);
  }

  private void Die()
  {
    poolManager.ReturnToPool(this);
  }

  #endregion
}
