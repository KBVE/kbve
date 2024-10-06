using System.Collections.Generic;
using UnityEngine;
using Cysharp.Threading.Tasks;

namespace Utils
{
    /// <summary>
    /// Handles the movement of an object to create a shooting star or asteroid effect.
    /// The object moves from an off-screen starting position to a defined end position at a specified speed.
    /// </summary>
    public class ShootingStar : MonoBehaviour
    {
        // Enum for different trajectory types
        public enum TrajectoryType
        {
            Linear,
            Curved,
            Parabolic
        }

        // Object pooling reference
        public static Queue<ShootingStar> ShootingStarPool = new Queue<ShootingStar>();

        // Shared resource locks for thread safety
        private static readonly object poolLock = new object(); // Lock for object pool access
        private readonly object stateLock = new object(); // Lock for internal state updates

        // Start and end positions for the shooting star effect
        [SerializeField] private Vector3 startPosition;
        [SerializeField] private Vector3 endPosition;

        // Speed at which the object moves
        [SerializeField] private float speed = 5.0f;

        // Optional delay before the object starts moving
        [SerializeField] private float startDelay = 0.0f;

        // Particle or trail effect to attach to the shooting star
        [SerializeField] private ParticleSystem particleEffect;
        [SerializeField] private TrailRenderer trailEffect;

        // Reference to a pixel art GameObject to attach to the shooting star
        [SerializeField] private GameObject pixelArtObject;

        // Randomization of start positions
        [SerializeField] private bool randomizeStart = false;
        [SerializeField] private Vector2 randomStartXRange = new Vector2(-15, 15);
        [SerializeField] private Vector2 randomStartYRange = new Vector2(10, 20);

        // Trajectory type for the shooting star
        [SerializeField] private TrajectoryType trajectory = TrajectoryType.Linear;

        // Flag to automatically start the movement
        [SerializeField] private bool autoStart = true;

        // Layer and sorting order for rendering the shooting star
        [SerializeField] private int sortingLayerID = 0; // Default layer ID
        [SerializeField] private int sortingOrder = 0;   // Default sorting order

        // Reference to the object's initial position for reusability
        private Vector3 initialPosition;

        /// <summary>
        /// Initialize the shooting star's initial position and effects.
        /// </summary>
        private void Awake()
        {
            // Initialize position and effects
            initialPosition = startPosition;
            transform.position = startPosition;

            // Set layer and sorting order for the pixel art and particle components
            SetLayerAndSortingOrder();

            // Set up the pixel art GameObject and particle effects
            if (pixelArtObject != null)
            {
                pixelArtObject.transform.position = startPosition;
                pixelArtObject.SetActive(true);
            }

            if (particleEffect != null)
                particleEffect.Stop();

            if (autoStart)
            {
                StartShootingStarEffectAsync().Forget();
            }
        }

        /// <summary>
        /// Sets the layer and sorting order for the pixel art and particle effects.
        /// </summary>
        private void SetLayerAndSortingOrder()
        {
            // Set sorting layer and order for the pixel art object
            if (pixelArtObject != null)
            {
                SpriteRenderer spriteRenderer = pixelArtObject.GetComponent<SpriteRenderer>();
                if (spriteRenderer != null)
                {
                    spriteRenderer.sortingLayerID = sortingLayerID;
                    spriteRenderer.sortingOrder = sortingOrder;
                }
            }

            // Set sorting order for particle system
            if (particleEffect != null)
            {
                Renderer particleRenderer = particleEffect.GetComponent<Renderer>();
                if (particleRenderer != null)
                {
                    particleRenderer.sortingLayerID = sortingLayerID;
                    particleRenderer.sortingOrder = sortingOrder;
                }
            }

            // Set sorting order for trail renderer
            if (trailEffect != null)
            {
                trailEffect.sortingLayerID = sortingLayerID;
                trailEffect.sortingOrder = sortingOrder;
            }
        }

        /// <summary>
        /// Start the shooting star effect asynchronously with a specified delay.
        /// </summary>
        /// <returns>A UniTask representing the asynchronous operation.</returns>
        public async UniTask StartShootingStarEffectAsync()
        {
            // Lock the internal state during updates
            lock (stateLock)
            {
                if (randomizeStart)
                {
                    startPosition = new Vector3(
                        Random.Range(randomStartXRange.x, randomStartXRange.y),
                        Random.Range(randomStartYRange.x, randomStartYRange.y),
                        startPosition.z
                    );
                    transform.position = startPosition;

                    if (pixelArtObject != null)
                        pixelArtObject.transform.position = startPosition;
                }
            }

            // Apply the delay if set
            if (startDelay > 0)
            {
                await UniTask.Delay((int)(startDelay * 1000)); // Convert seconds to milliseconds
            }

            // Use the main thread for Unity API calls
            await UniTask.SwitchToMainThread();

            // Activate particle or trail effects
            if (particleEffect != null) particleEffect.Play();
            if (trailEffect != null) trailEffect.Clear();

            // Start moving the object and pixel art object based on the selected trajectory
            switch (trajectory)
            {
                case TrajectoryType.Linear:
                    await MoveToPositionAsync(startPosition, endPosition, speed);
                    break;
                case TrajectoryType.Curved:
                    await MoveWithCurveAsync(startPosition, endPosition, speed);
                    break;
                case TrajectoryType.Parabolic:
                    await MoveWithParabolicTrajectoryAsync(startPosition, endPosition, speed);
                    break;
            }

            // After reaching the destination, reset or pool the object
            ResetOrPoolShootingStar();
        }

        /// <summary>
        /// Move the object from a start position to an end position at a specified speed.
        /// </summary>
        /// <param name="start">The starting position of the object.</param>
        /// <param name="end">The target position of the object.</param>
        /// <param name="moveSpeed">The speed at which the object should move.</param>
        /// <returns>A UniTask representing the asynchronous movement operation.</returns>
        private async UniTask MoveToPositionAsync(Vector3 start, Vector3 end, float moveSpeed)
        {
            float duration = Vector3.Distance(start, end) / moveSpeed;
            float elapsedTime = 0f;

            while (elapsedTime < duration)
            {
                Vector3 newPosition = Vector3.Lerp(start, end, elapsedTime / duration);
                transform.position = newPosition;

                if (pixelArtObject != null)
                    pixelArtObject.transform.position = newPosition;

                elapsedTime += Time.deltaTime;
                await UniTask.Yield();
            }

            transform.position = end;
            if (pixelArtObject != null)
                pixelArtObject.transform.position = end;
        }

        /// <summary>
        /// Move the object in a curved trajectory, including the pixel art GameObject.
        /// </summary>
        private async UniTask MoveWithCurveAsync(Vector3 start, Vector3 end, float moveSpeed)
        {
            float duration = Vector3.Distance(start, end) / moveSpeed;
            float elapsedTime = 0f;

            // Define control points for the curve (Bezier curve implementation)
            Vector3 controlPoint = (start + end) / 2 + Vector3.up * 5;

            while (elapsedTime < duration)
            {
                float t = elapsedTime / duration;
                Vector3 newPosition = (1 - t) * (1 - t) * start + 2 * (1 - t) * t * controlPoint + t * t * end;

                transform.position = newPosition;

                // Update pixel art object position
                if (pixelArtObject != null)
                    pixelArtObject.transform.position = newPosition;

                elapsedTime += Time.deltaTime;

                await UniTask.Yield();
            }

            transform.position = end;
            if (pixelArtObject != null)
                pixelArtObject.transform.position = end;
        }

        /// <summary>
        /// Move the object with a parabolic trajectory, including the pixel art GameObject.
        /// </summary>
        private async UniTask MoveWithParabolicTrajectoryAsync(Vector3 start, Vector3 end, float moveSpeed)
        {
            float duration = Vector3.Distance(start, end) / moveSpeed;
            float elapsedTime = 0f;

            while (elapsedTime < duration)
            {
                float t = elapsedTime / duration;
                float height = Mathf.Sin(t * Mathf.PI); // Use a sine function to simulate a parabolic arc

                Vector3 newPosition = Vector3.Lerp(start, end, t) + new Vector3(0, height * 5, 0);
                transform.position = newPosition;

                // Update pixel art object position
                if (pixelArtObject != null)
                    pixelArtObject.transform.position = newPosition;

                elapsedTime += Time.deltaTime;

                await UniTask.Yield();
            }

            transform.position = end;
            if (pixelArtObject != null)
                pixelArtObject.transform.position = end;
        }

        /// <summary>
        /// Resets the shooting star and its pixel art object to its initial position for reuse or pools it.
        /// </summary>
        private void ResetOrPoolShootingStar()
        {
            if (particleEffect != null) particleEffect.Stop();

            if (pixelArtObject != null)
            {
                pixelArtObject.transform.position = initialPosition;
                pixelArtObject.SetActive(false);
            }

            lock (poolLock)
            {
                ShootingStarPool.Enqueue(this);
                gameObject.SetActive(false); // Deactivate the shooting star for pooling
            }
        }

        /// <summary>
        /// Retrieves an instance of ShootingStar from the pool or creates a new one.
        /// </summary>
        public static ShootingStar GetFromPool()
        {
            lock (poolLock)
            {
                return ShootingStarPool.Count > 0 ? ShootingStarPool.Dequeue() : null;
            }
        }
    }
}
