//*       [IMPORTS]
using UnityEngine;
using UnityEngine.UI;

//?       [NPC] Class extends Entity
public class NPC : Entity
{
  public NPCData npcData; // Data object holding NPC properties
  public NPCPoolManager poolManager; // Manager handling pooling of NPCs
  public NPCAbilities abilities; // Script managing NPC abilities

  public int currentHealth; // Current health of the NPC
  public Vector3 location; // Current location of the NPC
  public bool isFriendly; // Flag indicating if the NPC is friendly or not
  private Transform target; // Reference to the target (player)
  private SpriteRenderer spriteRenderer; // Sprite Renderer for the NPC
  private Vector3 initialPosition;

  private void Awake()
  {
    spriteRenderer = GetComponent<SpriteRenderer>();
    if (spriteRenderer == null)
    {
      Debug.LogError("SpriteRenderer component is missing on this GameObject.", this);
    }
    if (Camera.main == null)
    {
      Debug.LogError("Main Camera is missing in the scene.", this);
    }

    initialPosition = transform.position;
  }

  protected virtual void Start()
  {
    base.Initialization();
    abilities = GetComponent<NPCAbilities>(); // Initialize abilities

  }

  protected virtual void Update()
  {
    if (spriteRenderer == null || Camera.main == null)
    {
      return;
    }

    location = transform.position; // Update location each frame

    transform.rotation = Quaternion.Euler(0f, Camera.main.transform.rotation.eulerAngles.y, 0f);

    FlipSpriteBasedOnViewpoint();
  }

  private void FlipSpriteBasedOnViewpoint()
  {
    Vector3 toCamera = Camera.main.transform.position - transform.position;
    bool shouldFlip = Vector3.Dot(toCamera, transform.right) < 0f;
    spriteRenderer.flipX = shouldFlip;
  }

  public void ReceiveDamage(int damage)
  {
    int _damage = Mathf.Max(0, damage - npcData.defensePower); // Apply damage to NPC, considering defense power
    base.TakeDamage(_damage);
  }

  private void Die()
  {
    poolManager.ReturnToPool(this);
    // if (healthBarCanvas != null)
    // {
    //   Destroy(healthBarCanvas.gameObject);
    // }
  }
}
