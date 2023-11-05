using UnityEngine;
using UnityEngine.UI;

public class SpriteBillboard : MonoBehaviour
{

    [Header("Health Settings")]
    [SerializeField] float maxHealth = 100f;
    private float currentHealth;
    private Canvas healthBarCanvas;
    private Image healthBarImage;

    [SerializeField] bool freezeAxis = true;
    [SerializeField] bool enableBobbing = false;  // Boolean to toggle bobbing effect
    [SerializeField] float bobbingSpeed = 2f;     // Speed of bobbing
    [SerializeField] float bobbingAmount = 0.5f;  // Amount of bobbing
    [SerializeField] bool enableFollowing = false;  // Boolean to toggle following
    [SerializeField] float followDistance = 5f;     // Distance to maintain from the target

    private Transform target;  // Reference to the target (player)
    private SpriteRenderer spriteRenderer;
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

        GameObject playerObject = GameObject.FindGameObjectWithTag("Player");
        if (playerObject != null)
        {
            target = playerObject.transform;
        }
        else
        {
            Debug.LogWarning("No object with tag 'Player' found in the scene.", this);
        }

        currentHealth = maxHealth;

        // Create the health bar canvas
        GameObject canvasGameObject = new GameObject("HealthBarCanvas");
        healthBarCanvas = canvasGameObject.AddComponent<Canvas>();
        healthBarCanvas.renderMode = RenderMode.WorldSpace;
        healthBarCanvas.worldCamera = Camera.main;

        // Create the health bar image
        GameObject imageGameObject = new GameObject("HealthBarImage");
        imageGameObject.transform.SetParent(canvasGameObject.transform);
        healthBarImage = imageGameObject.AddComponent<Image>();
        healthBarImage.color = Color.red;  // Set the health bar color to red
        healthBarImage.rectTransform.sizeDelta = new Vector2(2f, 0.2f);  // Set the health bar size
        healthBarImage.type = Image.Type.Filled;
        healthBarImage.fillMethod = Image.FillMethod.Horizontal;

        // Position the health bar canvas above the sprite
        healthBarCanvas.transform.position = transform.position + Vector3.up * 2f;

        // Parent the health bar canvas to the sprite
        healthBarCanvas.transform.SetParent(transform);

    }

    public void TakeDamage(float amount)
    {
        // Reduce the current health by the damage amount
        currentHealth = Mathf.Clamp(currentHealth - amount, 0f, maxHealth);

        // Update the health bar
        UpdateHealthBar();
    }

      private void UpdateHealthBar()
    {
        if (healthBarCanvas != null && healthBarImage != null)
        {
            // Calculate the health percentage
            float healthPercentage = currentHealth / maxHealth;

            // Update the health bar's size
            healthBarImage.fillAmount = healthPercentage;

            // Position the health bar above the sprite
            Vector3 worldPosition = transform.position + Vector3.up * 2f;
            healthBarCanvas.transform.position = worldPosition;
        }
    }

    private void Update()
    {
        if (spriteRenderer == null || Camera.main == null)
        {
            return;
        }

        if (freezeAxis)
        {
            transform.rotation = Quaternion.Euler(0f, Camera.main.transform.rotation.eulerAngles.y, 0f);
        }
        else
        {
            transform.rotation = Camera.main.transform.rotation;
        }

        FlipSpriteBasedOnViewpoint();

        if (enableBobbing)
        {
            BobSprite();
        }

        if (enableFollowing && target != null)
        {
            FollowTarget();
        }
        else if (target == null && enableFollowing)
        {
            Debug.LogError("Target is not assigned.", this);
        }
    }

    private void FlipSpriteBasedOnViewpoint()
    {
        Vector3 toCamera = Camera.main.transform.position - transform.position;
        bool shouldFlip = Vector3.Dot(toCamera, transform.right) < 0f;
        spriteRenderer.flipX = shouldFlip;
    }

    private void BobSprite()
    {
        float newY = initialPosition.y + Mathf.Sin(Time.time * bobbingSpeed) * bobbingAmount;
        transform.position = new Vector3(transform.position.x, newY, transform.position.z);
    }

    private void FollowTarget()
    {
        Vector3 directionToTarget = (target.position - transform.position).normalized;
        Vector3 desiredPosition = target.position - directionToTarget * followDistance;
        transform.position = new Vector3(desiredPosition.x, transform.position.y, desiredPosition.z);
    }
}
