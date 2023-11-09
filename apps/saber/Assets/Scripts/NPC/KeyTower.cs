using System.Collections;
using UnityEngine;

public class KeyTower : MonoBehaviour
{
    // Tower appearance settings
    [Header("Appearance Settings")]

    [Tooltip("Array of lines representing the tower's appearance")]
    [SerializeField] private Transform[] cosmicLines;

    [Tooltip("Starting width of the cosmic lines")]
    [SerializeField] private float startWidth = 0.35f;

    [Tooltip("Ending width of the cosmic lines")]
    [SerializeField] private float endWidth = 0.35f;

    [Tooltip("Starting color of the cosmic lines")]
    [SerializeField] private Color startColor = Color.green;

    [Tooltip("Ending color of the cosmic lines")]
    [SerializeField] private Color endColor = Color.white;

    [Tooltip("Material used for the cosmic lines")]
    [SerializeField] private Material material;

    // Tower rotation settings
    [Header("Rotation Settings")]

    [Range(0f, 5f)]
    [Tooltip("Time taken for the tower to smoothly rotate towards the player")]
    [SerializeField] private float rotationTime = 1.2f;

    [Range(1f, 15f)]
    [Tooltip("Speed at which arrows are shot")]
    [SerializeField] private float arrowSpeed = 3f;

    [Tooltip("Prefab of the arrow to be shot")]
    [SerializeField] private GameObject arrowPrefab;

    [Tooltip("Point from which arrows are spawned")]
    [SerializeField] private Transform arrowSpawnPoint;

    // Tower attack settings
    [Header("Attack Settings")]

    [Tooltip("Cooldown time between consecutive attacks")]
    [SerializeField] private float attackCooldown = 1.2f;

    [SerializeField] private float facingThreshold = 15f;


    private bool canAttack; // Flag indicating whether the tower can currently attack

    void Start()
    {
        InitializeCosmicLines(); // Set up the initial appearance of the tower
        canAttack = true;
    }


    void Update()
    {
        UpdateTowerRotation(Player.Instance.Position); // Update the tower's rotation to face the player

        if (IsFacingPlayer(Player.Instance.Position))
        {
            ShootArrow(); // Attempt to shoot an arrow towards the player
        }
    }

    void ShootArrow()
    {
        if (!canAttack) return;

        if (Player.Instance != null && arrowSpawnPoint != null)
        {
            // Instantiate arrow gameobject and add rigidbody to it
            GameObject spawnedArrow = Instantiate<GameObject>(arrowPrefab, arrowSpawnPoint.position, Quaternion.identity);
            Rigidbody arrowRb = spawnedArrow.gameObject.AddComponent<Rigidbody>();

            // Freeze (x, y, z) rotation, so it won't effect from physics
            arrowRb.freezeRotation = true;

            // Remove gravity so it wont affect on arrow
            arrowRb.useGravity = false;

            // Calculate player's direction
            Vector3 direction = Player.Instance.Position - transform.position;

            // Shoot arrow towards player
            arrowRb.velocity = direction * arrowSpeed;


            // Add cooldown for next attack
            StartCoroutine(OnCooldown());
        }
        else
        {
            Debug.Log("Player or Arrow Point is missing...");
        }
    }

    void UpdateTowerRotation(Vector3 playerPosition)
    {
        // Calculate the direction to the player
        Vector3 direction = playerPosition - transform.position;

        // Create a rotation that looks in the player's direction
        Quaternion targetRotation = Quaternion.LookRotation(direction);

        // Smoothly interpolate between the current rotation and the target rotation
        transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, rotationTime * Time.deltaTime);
    }

    void InitializeCosmicLines()
    {
        for (int i = 0; i < cosmicLines.Length; i++)
        {
            // Set up the appearance of the tower using LineRenderer for each cosmic line
            LineRenderer lineRenderer = cosmicLines[i].gameObject.AddComponent<LineRenderer>();


            // Set the positions, width, color, and material for each cosmic line
            lineRenderer.SetPosition(0, cosmicLines[i].position);
            lineRenderer.SetPosition(1, transform.position);

            // Width
            lineRenderer.startWidth = startWidth;
            lineRenderer.endWidth = endWidth;

            // Color
            lineRenderer.startColor = startColor;
            lineRenderer.endColor = endColor;

            // Material
            lineRenderer.material = material;
        }
    }

    // Coroutine to handle the cooldown between consecutive attacks
    IEnumerator OnCooldown()
    {
        canAttack = false;
        yield return new WaitForSeconds(attackCooldown);
        canAttack = true;
    }

    bool IsFacingPlayer(Vector3 playerPos)
    {
        Vector3 dir = playerPos - transform.position;
        float angleToPlayer = Vector3.Angle(transform.forward, dir);
        return angleToPlayer < facingThreshold;
    }

    // Getter method to retrieve the cosmic lines of the tower
    public Transform[] GetCosmicLines()
    {
        return cosmicLines;
    }
}
