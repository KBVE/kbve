using UnityEngine;
using KBVE.Kilonet.States;
using KBVE.Kilonet.Events;
using Cysharp.Threading.Tasks;

namespace KBVE.Kilonet
{

    public class KBVEGameManager : MonoBehaviour
    {
        public static KBVEGameManager Instance { get; private set; }

        private StateMachine stateMachine;

        private void Awake()
        {
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

            stateMachine = new StateMachine(GameState.MainMenu);

            // Subscribe to state change events and link them to the appropriate methods
            GlobalEvents.Subscribe(EventFlag.OnMainMenu, async _ => await OnMainMenuStateEntered());
            GlobalEvents.Subscribe(EventFlag.OnPlaying, async _ => await OnPlayingStateEntered());
            GlobalEvents.Subscribe(EventFlag.OnPaused, async _ => await OnPausedStateEntered());
            GlobalEvents.Subscribe(EventFlag.OnGameOver, async _ => await OnGameOverStateEntered());

            // Trigger the initial state (MainMenu)
            GlobalEvents.TriggerEventsAsync(EventFlag.OnMainMenu).Forget();
        }

        private async UniTask OnMainMenuStateEntered()
        {
            Debug.Log("Entered Main Menu state.");
            await UniTask.CompletedTask;
        }

        private async UniTask OnPlayingStateEntered()
        {
            Debug.Log("Entered Playing state.");
            await UniTask.CompletedTask;
        }

        private async UniTask OnPausedStateEntered()
        {
            Debug.Log("Entered Paused state.");
            await UniTask.CompletedTask;
        }

        private async UniTask OnGameOverStateEntered()
        {
            Debug.Log("Entered Game Over state.");
            await UniTask.CompletedTask;
        }

        public async UniTask ChangeGameStateAsync(GameState newState)
        {
            Debug.Log($"Changing game state to: {newState}");
            await stateMachine.ChangeStateAsync(newState);
            GlobalEvents.TriggerEventsAsync(ConvertStateToEventFlag(newState)).Forget();
        }

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

        public async void StartGame()
        {
            await ChangeGameStateAsync(GameState.Playing);
        }

        public async void PauseGame()
        {
            await ChangeGameStateAsync(GameState.Paused);
        }

        public async void EndGame()
        {
            await ChangeGameStateAsync(GameState.GameOver);
        }


        public async void ReturnToMainMenu()
        {
            await ChangeGameStateAsync(GameState.MainMenu);
        }

        private void OnDestroy()
        {
            GlobalEvents.ClearAllEvents();
        }
    }
}
