using System.Collections.Generic;
using UnityEngine;
using Cysharp.Threading.Tasks;

namespace Utils
{
    /// <summary>
    /// Manages the spawning and movement of shooting stars or asteroids using a pool of visual-only prefab instances.
    /// The script controls the prefab objects, moving them across the screen and reusing them as needed.
    /// </summary>
    public class ShootingStarController : MonoBehaviour
    {
        // Enum for different trajectory types
        public enum TrajectoryType
        {
            Linear,
            Curved,
            Parabolic
        }

        // Reference to the prefab of the shooting star, which only contains visual components (e.g., SpriteRenderer, ParticleSystem).
        [SerializeField] private GameObject shootingStarPrefab; // Assign the visual prefab here in the Inspector

        // Object pooling reference
        private static Queue<GameObject> shootingStarPool = new Queue<GameObject>();

        // Shared resource lock for thread safety
        private static readonly object poolLock = new object(); // Lock for object pool access

        // Start and end positions for the shooting star effect
        [SerializeField] private Vector3 startPosition;
        [SerializeField] private Vector3 endPosition; // Allow public access for end position

        // Speed at which the object moves
        [SerializeField] private float speed = 5.0f;

        // Optional delay before the object starts moving
        [SerializeField] private float startDelay = 0.5f; // Default delay is set to 0.5 seconds

        // Randomization of start positions
        [SerializeField] private bool randomizeStart = false;
        [SerializeField] private Vector2 randomStartXRange = new Vector2(-15, 15);
        [SerializeField] private Vector2 randomStartYRange = new Vector2(10, 20);

        // Trajectory type for the shooting star
        [SerializeField] private TrajectoryType trajectory = TrajectoryType.Linear;

        // Number of shooting stars to preload in the pool
        [SerializeField] private int poolSize = 10;

        // Time delay between shooting star spawns
        [SerializeField] private float spawnDelay = 2.0f;

        // Flag to automatically start the movement
        [SerializeField] private bool autoStart = true;

        /// <summary>
        /// Initialize the shooting star's initial position and preload the pool.
        /// </summary>
        private async void Awake()
        {
            if (shootingStarPrefab == null)
            {
                Debug.LogError("ShootingStar prefab is not set. Please assign the prefab in the Inspector.");
                return;
            }

            // Preload the pool with the desired number of instances
            PreloadPool(poolSize);

            // If auto-start is enabled, begin spawning shooting stars
            if (autoStart)
            {
                await StartSpawningShootingStarsAsync();
            }
        }

        /// <summary>
        /// Preload the pool with a specified number of ShootingStar prefab instances.
        /// </summary>
        /// <param name="numberToPreload">Number of ShootingStar instances to create and add to the pool.</param>
        private void PreloadPool(int numberToPreload)
        {
            lock (poolLock)
            {
                for (int i = 0; i < numberToPreload; i++)
                {
                    GameObject shootingStarInstance = Instantiate(shootingStarPrefab); // Instantiate the prefab
                    shootingStarInstance.SetActive(false); // Deactivate it
                    shootingStarInstance.name = "ShootingStar_" + i; // Name it for easier debugging
                    shootingStarPool.Enqueue(shootingStarInstance); // Add to pool
                }
            }

            Debug.Log($"Successfully preloaded {numberToPreload} shooting stars into the pool.");
        }

        /// <summary>
        /// Continuously spawn shooting stars with the specified delay, while reusing objects from the pool.
        /// </summary>
        /// <returns>A UniTask representing the asynchronous operation.</returns>
        private async UniTask StartSpawningShootingStarsAsync()
        {
            while (true) // Continuously spawn shooting stars in an infinite loop
            {
                GameObject shootingStar = GetFromPool();
                if (shootingStar != null)
                {
                    InitializeAndActivate(shootingStar); // Activate and start its movement
                }

                await UniTask.Delay((int)(spawnDelay * 1000)); // Wait for the spawn delay
            }
        }

        /// <summary>
        /// Retrieve a ShootingStar instance from the pool.
        /// </summary>
        /// <returns>A ShootingStar instance from the pool or null if no instances are available.</returns>
        private static GameObject GetFromPool()
        {
            lock (poolLock)
            {
                if (shootingStarPool.Count > 0)
                {
                    GameObject star = shootingStarPool.Dequeue(); // Dequeue an object from the pool
                    star.SetActive(true); // Reactivate the object
                    return star;
                }

                return null; // Return null if no objects are available in the pool
            }
        }

        /// <summary>
        /// Initialize and activate the shooting star with randomized positions.
        /// </summary>
        /// <param name="shootingStar">The ShootingStar GameObject to activate.</param>
        private void InitializeAndActivate(GameObject shootingStar)
        {
            // Set a random start position within the specified range
            if (randomizeStart)
            {
                startPosition = new Vector3(
                    Random.Range(randomStartXRange.x, randomStartXRange.y),
                    Random.Range(randomStartYRange.x, randomStartYRange.y),
                    startPosition.z
                );
            }

            shootingStar.transform.position = startPosition;

            // Set the end position dynamically
            endPosition = startPosition + new Vector3(Random.Range(-5, 5), -15, 0);

            // Start the shooting star effect asynchronously
            StartShootingStarEffectAsync(shootingStar).Forget();
        }

        /// <summary>
        /// Start the shooting star effect asynchronously, applying the start delay if set.
        /// </summary>
        private async UniTask StartShootingStarEffectAsync(GameObject shootingStar)
        {
            // Apply the start delay before starting the movement
            if (startDelay > 0)
            {
                await UniTask.Delay((int)(startDelay * 1000)); // Delay is in milliseconds
            }

            // Use the main thread for Unity API calls
            await UniTask.SwitchToMainThread();

            // Move based on the selected trajectory type
            switch (trajectory)
            {
                case TrajectoryType.Linear:
                    await MoveToPositionAsync(shootingStar, startPosition, endPosition, speed);
                    break;
                case TrajectoryType.Curved:
                    await MoveWithCurveAsync(shootingStar, startPosition, endPosition, speed);
                    break;
                case TrajectoryType.Parabolic:
                    await MoveWithParabolicTrajectoryAsync(shootingStar, startPosition, endPosition, speed);
                    break;
            }

            // Return to the pool after completion
            ResetAndReturnToPool(shootingStar);
        }

        /// <summary>
        /// Move the object in a linear trajectory.
        /// </summary>
        private async UniTask MoveToPositionAsync(GameObject shootingStar, Vector3 start, Vector3 end, float moveSpeed)
        {
            float duration = Vector3.Distance(start, end) / moveSpeed;
            float elapsedTime = 0f;

            while (elapsedTime < duration)
            {
                shootingStar.transform.position = Vector3.Lerp(start, end, elapsedTime / duration);
                elapsedTime += Time.deltaTime;
                await UniTask.Yield();
            }

            shootingStar.transform.position = end;
        }

        /// <summary>
        /// Move the object in a curved trajectory.
        /// </summary>
        private async UniTask MoveWithCurveAsync(GameObject shootingStar, Vector3 start, Vector3 end, float moveSpeed)
        {
            float duration = Vector3.Distance(start, end) / moveSpeed;
            float elapsedTime = 0f;

            // Define a control point for a Bezier curve
            Vector3 controlPoint = (start + end) / 2 + Vector3.up * 5;

            while (elapsedTime < duration)
            {
                float t = elapsedTime / duration;
                shootingStar.transform.position = (1 - t) * (1 - t) * start + 2 * (1 - t) * t * controlPoint + t * t * end;
                elapsedTime += Time.deltaTime;
                await UniTask.Yield();
            }

            shootingStar.transform.position = end;
        }

        /// <summary>
        /// Move the object in a parabolic trajectory.
        /// </summary>
        private async UniTask MoveWithParabolicTrajectoryAsync(GameObject shootingStar, Vector3 start, Vector3 end, float moveSpeed)
        {
            float duration = Vector3.Distance(start, end) / moveSpeed;
            float elapsedTime = 0f;

            while (elapsedTime < duration)
            {
                float t = elapsedTime / duration;
                float height = Mathf.Sin(t * Mathf.PI);
                shootingStar.transform.position = Vector3.Lerp(start, end, t) + new Vector3(0, height * 5, 0);
                elapsedTime += Time.deltaTime;
                await UniTask.Yield();
            }

            shootingStar.transform.position = end;
        }

        /// <summary>
        /// Reset the shooting star and return it to the pool.
        /// </summary>
        private void ResetAndReturnToPool(GameObject shootingStar)
        {
            lock (poolLock)
            {
                shootingStar.SetActive(false); // Deactivate the object
                shootingStarPool.Enqueue(shootingStar); // Return to the pool
            }
        }
    }
}
