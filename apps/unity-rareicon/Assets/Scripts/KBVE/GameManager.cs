using UnityEngine;
using Cysharp.Threading.Tasks;
using Utils; // Import the Utils namespace to access the Parallax component

namespace KBVE
{
    /// <summary>
    /// GameManager serves as the main entry point for managing game states and global events.
    /// It initializes the state machine, handles state transitions, and communicates with other game systems using GlobalEvents.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        // Singleton instance of the GameManager
        public static GameManager Instance { get; private set; }

        // State machine to handle game state transitions
        private StateMachine stateMachine;

        // Reference to the Parallax component in the scene
        // private Parallax parallaxController;

        /// <summary>
        /// Initialize the GameManager instance and configure game state and events.
        /// </summary>
        private void Awake()
        {
            // Ensure that only one instance of GameManager exists
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject); // Persist across scene loads
            }
            else
            {
                Destroy(gameObject); // Destroy duplicate instances
                return;
            }

            // Initialize the state machine with a starting state
            stateMachine = new StateMachine(GameState.MainMenu);

            // Subscribe to state change events and link them to the appropriate methods
            GlobalEvents.Subscribe(EventFlag.OnMainMenu, async _ => await OnMainMenuStateEntered());
            GlobalEvents.Subscribe(EventFlag.OnPlaying, async _ => await OnPlayingStateEntered());
            GlobalEvents.Subscribe(EventFlag.OnPaused, async _ => await OnPausedStateEntered());
            GlobalEvents.Subscribe(EventFlag.OnGameOver, async _ => await OnGameOverStateEntered());

            // Attempt to find the Parallax component in the scene
            // Replacing -> parallaxController = FindObjectOfType<Parallax>();
            // parallaxController = Object.FindFirstObjectByType<Parallax>();

            // if (parallaxController == null)
            // {
            //     Debug.LogWarning("No Parallax component found in the scene. Ensure you have a GameObject with the Parallax component attached.");
            // }

            // Trigger the initial state (MainMenu)
            GlobalEvents.TriggerEventsAsync(EventFlag.OnMainMenu).Forget();
        }

        /// <summary>
        /// Handle transition to the Main Menu state.
        /// </summary>
        private async UniTask OnMainMenuStateEntered()
        {
            Debug.Log("Entered Main Menu state.");

            // Start the parallax effect if the Parallax component is available
            // if (parallaxController != null)
            // {
            //     await parallaxController.StartParallaxIfNotStartedAsync();
            // }

            // Additional logic for entering Main Menu state can go here
            await UniTask.CompletedTask;
        }

        /// <summary>
        /// Handle transition to the Playing state.
        /// </summary>
        private async UniTask OnPlayingStateEntered()
        {
            Debug.Log("Entered Playing state.");
            // Stop or adjust parallax if needed for Playing state
            // Add additional logic for entering Playing state
            await UniTask.CompletedTask;
        }

        /// <summary>
        /// Handle transition to the Paused state.
        /// </summary>
        private async UniTask OnPausedStateEntered()
        {
            Debug.Log("Entered Paused state.");
            // Optionally pause parallax or animations
            await UniTask.CompletedTask;
        }

        /// <summary>
        /// Handle transition to the Game Over state.
        /// </summary>
        private async UniTask OnGameOverStateEntered()
        {
            Debug.Log("Entered Game Over state.");
            // Optionally stop or reset parallax for Game Over state
            await UniTask.CompletedTask;
        }

        /// <summary>
        /// Change the current game state and broadcast the state change.
        /// </summary>
        /// <param name="newState">The new game state to transition to.</param>
        public async UniTask ChangeGameStateAsync(GameState newState)
        {
            Debug.Log($"Changing game state to: {newState}");

            // Change the state in the state machine
            await stateMachine.ChangeStateAsync(newState);

            // Trigger a global event for the new state
            GlobalEvents.TriggerEventsAsync(ConvertStateToEventFlag(newState)).Forget();
        }

        /// <summary>
        /// Convert a GameState enum value to an EventFlag for triggering events.
        /// </summary>
        /// <param name="state">The game state to convert.</param>
        /// <returns>The corresponding EventFlag.</returns>
        private EventFlag ConvertStateToEventFlag(GameState state)
        {
            return state switch
            {
                GameState.MainMenu => EventFlag.OnMainMenu,
                GameState.Playing => EventFlag.OnPlaying,
                GameState.Paused => EventFlag.OnPaused,
                GameState.GameOver => EventFlag.OnGameOver,
                GameState.Loading => EventFlag.OnLoading,
                _ => EventFlag.None
            };
        }

        /// <summary>
        /// Example function to start the game by transitioning to the Playing state.
        /// </summary>
        public async void StartGame()
        {
            await ChangeGameStateAsync(GameState.Playing);
        }

        /// <summary>
        /// Example function to pause the game by transitioning to the Paused state.
        /// </summary>
        public async void PauseGame()
        {
            await ChangeGameStateAsync(GameState.Paused);
        }

        /// <summary>
        /// Example function to end the game by transitioning to the Game Over state.
        /// </summary>
        public async void EndGame()
        {
            await ChangeGameStateAsync(GameState.GameOver);
        }

        /// <summary>
        /// Example function to return to the Main Menu by transitioning to the Main Menu state.
        /// </summary>
        public async void ReturnToMainMenu()
        {
            await ChangeGameStateAsync(GameState.MainMenu);
        }

        /// <summary>
        /// Clean up event subscriptions and other resources on destroy.
        /// </summary>
        private void OnDestroy()
        {
            // Unsubscribe from all events to prevent memory leaks
            GlobalEvents.ClearAllEvents();
        }
    }
}
