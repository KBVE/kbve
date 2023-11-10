//*      [IMPORTS]
using UnityEngine;
using UnityEngine.SceneManagement;

public class Player : MonoBehaviour
{

    //! Player Instance
    public static Player Instance { get; private set; }

    [SerializeField] private Camera playerCamera;


    // Player Data
    public int Health { get; private set; }
    public Vector3 Position => transform.position;
    public string CurrentScene => SceneManager.GetActiveScene().name;
    public int Level { get; private set; }
    public PlayerStats Stats { get; private set; }


    public Camera PlayerCamera
    {
        get { return playerCamera; }
    }

    // Ensure there is only one instance of this class in the game + checks
    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject); // Persist across scenes
            playerCamera = Camera.main; // Assuming there's only one main camera

        }
        else
        {
            Destroy(gameObject);
        }
    }

    private void Start()
    {
        // Initialize stats, health, and level
        Stats = new PlayerStats(); // Base Stats
        Health = 100; // Base Health of 100
        Level = 1; // Base level of 1
    }

    // A method to damage the player
    public void TakeDamage(int damage)
    {
        Health -= damage;
        if (Health <= 0)
        {
            // Handle player death
            Die();
        }
    }

    // A method to heal the player
    public void Heal(int healAmount)
    {
        Health += healAmount;
        Health = Mathf.Clamp(Health, 0, 100);
    }

    // Call this to update the player's level, for example when they gain experience
    public void LevelUp()
    {
        Level++;
        // Update stats accordingly
        Stats.IncreaseStatsForLevelUp();
    }

    // Implement player death logic
    private void Die()
    {
        //TODO Signaling the game manager
        //TODO Playing an animation.
        Debug.Log("Player has died.");
    }
}

// A separate class for player stats
public class PlayerStats
{
    public int Strength { get; private set; }
    public int Agility { get; private set; }
    public int Intelligence { get; private set; }

    public PlayerStats()
    {
        Strength = 10;
        Agility = 10;
        Intelligence = 10;
    }

    public void IncreaseStatsForLevelUp()
    {
        // Increase stats as an example, these values can be adjusted as needed
        Strength += 2;
        Agility += 2;
        Intelligence += 2;
    }
}
