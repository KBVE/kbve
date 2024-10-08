using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Cysharp.Threading.Tasks;

namespace Utils
{
    /// <summary>
    /// Parallax effect controller for canvases tagged with "BG" and their children tagged with "Parallax".
    /// This script searches for all canvases with the "BG" tag and applies a parallax effect to any child objects tagged with "Parallax".
    /// </summary>
    public class Parallax : MonoBehaviour
    {
        // Speed of the parallax movement for each object
        [SerializeField] private float parallaxSpeed = 0.5f;

        // List to hold parallax objects
        private List<Transform> parallaxObjects;

        // Reference to the camera's previous position
        private Vector3 previousCameraPosition;

        // Boolean flag to track if the parallax system has been initialized
        private bool isParallaxStarted = false;

        // Lock object for thread-safety
        private readonly object lockObj = new object();

        /// <summary>
        /// Initializes the Parallax system at the start if not already initialized.
        /// </summary>
        private async void Start()
        {
            // Call StartParallaxIfNotStartedAsync only if it hasn't been started yet
            await StartParallaxIfNotStartedAsync();
        }

        /// <summary>
        /// Asynchronously initializes and starts the parallax effect if it hasn't been started already.
        /// Ensures that initialization happens only once, regardless of where it is called from.
        /// </summary>
        /// <returns>A UniTask representing the asynchronous operation.</returns>
        public async UniTask StartParallaxIfNotStartedAsync()
        {
            // Use a lock to ensure thread-safety for the initialization flag
            lock (lockObj)
            {
                // Check if the parallax has already started
                if (isParallaxStarted)
                {
                    Debug.Log("Parallax effect has already been started. Skipping initialization.");
                    return;
                }

                // Set flag to indicate initialization has started
                isParallaxStarted = true;
            }

            // Start the parallax effect asynchronously
            await StartParallaxAsync();
        }

        /// <summary>
        /// Asynchronously initializes and starts the parallax effect by finding canvases and objects tagged for parallax.
        /// </summary>
        public async UniTask StartParallaxAsync()
        {
            Debug.Log("Initializing and starting the Parallax effect...");

            // Asynchronously find canvases and objects tagged for parallax
            await FindParallaxObjectsAsync();

            // Set the initial camera position
            previousCameraPosition = Camera.main.transform.position;

            Debug.Log("Parallax effect successfully started.");
        }

        /// <summary>
        /// Asynchronously find canvases with the "BG" tag and collect their child objects tagged as "Parallax".
        /// </summary>
        private async UniTask FindParallaxObjectsAsync()
        {
            // Wait until the scene is fully loaded and the camera is available before searching for objects
            await UniTask.WaitUntil(() => Camera.main != null);

            // Find all canvas objects in the scene with the "BG" tag
            var canvases = GameObject.FindGameObjectsWithTag("BG");

            parallaxObjects = new List<Transform>();

            // Iterate through each canvas to find child objects with the "Parallax" tag
            foreach (var canvas in canvases)
            {
                var parallaxChildren = canvas.transform
                    .GetComponentsInChildren<Transform>()
                    .Where(child => child.CompareTag("Parallax"))
                    .ToList();

                // Add each found parallax child to the list of parallax objects
                parallaxObjects.AddRange(parallaxChildren);
            }

            Debug.Log($"Found {parallaxObjects.Count} objects tagged with 'Parallax' under canvases tagged with 'BG'.");
        }

        /// <summary>
        /// Update the position of parallax objects based on the camera's movement.
        /// </summary>
        private void Update()
        {
            if (parallaxObjects == null || parallaxObjects.Count == 0) return;

            // Calculate the camera movement since the last frame
            Vector3 cameraDeltaMovement = Camera.main.transform.position - previousCameraPosition;

            // Apply parallax effect to each object
            foreach (var parallaxObject in parallaxObjects)
            {
                Vector3 newPos = parallaxObject.position;
                newPos.x += cameraDeltaMovement.x * parallaxSpeed * Time.deltaTime;
                newPos.y += cameraDeltaMovement.y * parallaxSpeed * Time.deltaTime;
                parallaxObject.position = newPos;
            }

            // Update the previous camera position for the next frame
            previousCameraPosition = Camera.main.transform.position;
        }

        /// <summary>
        /// Allow the parallax speed to be dynamically adjusted via script or inspector.
        /// </summary>
        /// <param name="newSpeed">New parallax speed to apply to objects.</param>
        public void SetParallaxSpeed(float newSpeed)
        {
            parallaxSpeed = newSpeed;
        }
    }
}
