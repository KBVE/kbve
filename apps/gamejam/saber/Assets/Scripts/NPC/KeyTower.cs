using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class KeyTower : MonoBehaviour
{
    // Static variable to keep track of active cosmic lines
    public static int activeCosmicLines = 0;

    // Cosmic Line Settings
    [Header("Appearance Settings")]
    [Tooltip("List of cosmic line game objects")]
    [SerializeField] private List<GameObject> cosmicLines;

    [Tooltip("Material used for the cosmic lines")]
    [SerializeField] private Material cosmicMaterial;

    [Tooltip("Starting width of the cosmic lines")]
    [SerializeField] private float startLineWidth = 0.35f;

    [Tooltip("Ending width of the cosmic lines")]
    [SerializeField] private float endLineWidth = 0.35f;

    [Tooltip("Starting color of the cosmic lines")]
    [SerializeField] private Color startLineColor = Color.green;

    [Tooltip("Ending color of the cosmic lines")]
    [SerializeField] private Color endLineColor = Color.white;

    // Tower Rotation
    [Header("Rotation Settings")]
    [Range(0f, 5f)]
    [Tooltip("Time taken for the tower to smoothly rotate towards the player")]
    [SerializeField] private float rotationTime = 1.2f;

    [Tooltip("Threshold angle for tower to consider facing the player")]
    [SerializeField] private float facingThreshold = 15f;

    [Range(1f, 15f)]
    [Tooltip("Speed at which arrows are shot")]
    [SerializeField] private float arrowSpeed = 3f;

    [Tooltip("Prefab of the arrow to be shot")]
    [SerializeField] private GameObject arrowPrefab;

    [Tooltip("Point from which arrows are spawned")]
    [SerializeField] private Transform arrowSpawnPoint;

    // Tower Attack
    [Header("Attack Settings")]
    [Tooltip("Cooldown time between consecutive attacks")]
    [SerializeField] private float attackCooldown = 1.2f;

    // Castle Key
    [Header("Key Settings")]
    [Tooltip("Prefab of the key to be spawned")]
    [SerializeField] private GameObject keyPrefab;

    [Tooltip("Point from which keys are spawned")]
    [SerializeField] private Transform keySpawnPoint;

    private bool canAttack = true;
    private bool isKeySpawned = false;

    void Start()
    {
        // Initialize the count of active cosmic lines
        activeCosmicLines = cosmicLines.Count;

        // Set up the initial appearance of the tower
        InitializeCosmicLines();
    }

    void Update()
    {
        // Check if key is spawned or player is not available
        if (isKeySpawned || Player.Instance == null) return;

        // Spawn key, update tower rotation, and shoot arrow if facing the player
        SpawnKey();
        UpdateTowerRotation(Player.Instance.Position);

        if (IsFacingPlayer(Player.Instance.Position))
        {
            ShootArrow();
        }
    }

    void ShootArrow()
    {
        // Check if the tower can attack or arrow spawn point is not set
        if (!canAttack || arrowSpawnPoint == null) return;

        // Instantiate arrow and set its properties
        GameObject spawnedArrow = Instantiate(arrowPrefab, arrowSpawnPoint.position, Quaternion.identity);
        Rigidbody arrowRigidbody = spawnedArrow.AddComponent<Rigidbody>();
        arrowRigidbody.freezeRotation = true;
        arrowRigidbody.useGravity = false;
        Vector3 directionToPlayer = Player.Instance.Position - transform.position;
        arrowRigidbody.velocity = directionToPlayer * arrowSpeed;

        // Start the cooldown for the next attack
        StartCoroutine(AttackCooldown());
    }

    void UpdateTowerRotation(Vector3 playerPosition)
    {
        // Calculate the direction to the player
        Vector3 directionToPlayer = playerPosition - transform.position;

        // Create a rotation that looks in the player's direction
        Quaternion targetRotation = Quaternion.LookRotation(directionToPlayer);

        // Smoothly interpolate between the current rotation and the target rotation
        transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, rotationTime * Time.deltaTime);
    }

    void InitializeCosmicLines()
    {
        // Iterate through cosmic lines and set up their appearance
        foreach (var cosmicLineGameObject in cosmicLines)
        {
            LineRenderer lineRenderer = cosmicLineGameObject.AddComponent<LineRenderer>();
            CosmicLine cosmicLineInteraction = cosmicLineGameObject.transform.GetChild(0).gameObject.AddComponent<CosmicLine>();
            cosmicLineInteraction.shouldFace = false;

            // Set the positions, width, color, and material for each cosmic line
            lineRenderer.SetPosition(0, cosmicLineGameObject.transform.position);
            lineRenderer.SetPosition(1, transform.position);
            lineRenderer.startWidth = startLineWidth;
            lineRenderer.endWidth = endLineWidth;
            lineRenderer.startColor = startLineColor;
            lineRenderer.endColor = endLineColor;
            lineRenderer.material = cosmicMaterial;
        }
    }

    void SpawnKey()
    {
        // Check if there are no active cosmic lines and key is not spawned
        if (activeCosmicLines == 0 && !isKeySpawned)
        {
            // Instantiate the key at the specified position
            Instantiate(keyPrefab, keySpawnPoint.position, Quaternion.identity);
            isKeySpawned = true;
        }
    }

    IEnumerator AttackCooldown()
    {
        // Set the attack flag to false and wait for the cooldown period
        canAttack = false;
        yield return new WaitForSeconds(attackCooldown);
        // Set the attack flag back to true after the cooldown
        canAttack = true;
    }

    bool IsFacingPlayer(Vector3 playerPosition)
    {
        // Calculate the angle to the player and check if it is within the facing threshold
        float angleToPlayer = Vector3.Angle(transform.forward, playerPosition - transform.position);
        return angleToPlayer < facingThreshold;
    }
}
