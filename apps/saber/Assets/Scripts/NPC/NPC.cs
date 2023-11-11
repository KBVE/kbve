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
    private Transform target;  // Reference to the target (player)
    private SpriteRenderer spriteRenderer; // Sprite Renderer for the NPC
    private Vector3 initialPosition;


    private Canvas healthBarCanvas;
    private Image healthBarImage;
    public Vector3 healthBarOffset = new Vector3(0, 2f, 0); // Offset the health bar above the NPC


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
        abilities = GetComponent<NPCAbilities>(); // Initialize abilities
        currentHealth = npcData.maxHealth; // Set current health to max
        location = transform.position; // Store initial location
        CreateHealthBar(); // Create the health bar UI
    }


     private void CreateHealthBar()
    {
        // Create the health bar canvas
        GameObject canvasGameObject = new GameObject("HealthBarCanvas");
        healthBarCanvas = canvasGameObject.AddComponent<Canvas>();
        healthBarCanvas.renderMode = RenderMode.WorldSpace;
        healthBarCanvas.worldCamera = Camera.main;

        // Set the size of the canvas
        RectTransform rt = canvasGameObject.GetComponent<RectTransform>();
        rt.sizeDelta = new Vector2(2, 0.4f);

        // Create the health bar image
        GameObject imageGameObject = new GameObject("HealthBarImage");
        imageGameObject.transform.SetParent(canvasGameObject.transform, false);
        healthBarImage = imageGameObject.AddComponent<Image>();
        healthBarImage.color = Color.red;
        healthBarImage.rectTransform.sizeDelta = new Vector2(2f, 0.2f);
        healthBarImage.type = Image.Type.Filled;
        healthBarImage.fillMethod = Image.FillMethod.Horizontal;

        // Position and parent the health bar canvas
        healthBarCanvas.transform.SetParent(transform);
        healthBarCanvas.transform.localPosition = healthBarOffset;
    }

    private void UpdateHealthBar(float healthPercentage)
    {
        if (healthBarImage != null)
        {
            healthBarImage.fillAmount = healthPercentage;
        }
    }


    protected virtual void Update()
    {

        if (spriteRenderer == null || Camera.main == null)
        {
          return ;
        }

        location = transform.position; // Update location each frame

          // Assuming you have a method to calculate health percentage
        UpdateHealthBar(GetHealthPercentage());

        // Face the health bar towards the camera
        /*
        if (healthBarCanvas != null)
        {
            healthBarCanvas.transform.LookAt(healthBarCanvas.transform.position + Camera.main.transform.rotation * Vector3.forward);
        }
        */

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
        currentHealth -= Mathf.Max(0, damage - npcData.defensePower); // Apply damage to NPC, considering defense power
        if (healthBarCanvas != null)
        {
                    UpdateHealthBar(GetHealthPercentage()); // Update the health bar to reflect the new health

        }

        if (currentHealth <= 0)
        {
            currentHealth = 0; // Ensure health doesn't go below 0
            Die(); // NPC dies if health reaches zero or below
        }
    }



    private void Die()
    {
        poolManager.ReturnToPool(this);
        if (healthBarCanvas != null)
        {
            Destroy(healthBarCanvas.gameObject);
        }
    }


    float GetHealthPercentage()
    {
        // Placeholder for actual health percentage calculation
        return currentHealth / (float)npcData.maxHealth;
    }
}
