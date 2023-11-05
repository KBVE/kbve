using UnityEngine;

public class SpriteBillboard : MonoBehaviour
{
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
