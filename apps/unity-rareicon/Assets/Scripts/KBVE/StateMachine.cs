using System;
using System.IO;
using UnityEngine;
using Cysharp.Threading.Tasks;
using Utils; // Import the Utils namespace for UtilityJSON usage

namespace KBVE
{
    /// <summary>
    /// Enumeration representing the various game states.
    /// </summary>
    [Flags]
    public enum GameState
    {
        /// <summary>
        /// No state is set.
        /// </summary>
        None = 0,

        /// <summary>
        /// The game is in the Main Menu.
        /// </summary>
        MainMenu = 1 << 0, // Binary: 0001 (1)

        /// <summary>
        /// The game is currently being played.
        /// </summary>
        Playing = 1 << 1,  // Binary: 0010 (2)

        /// <summary>
        /// The game is paused.
        /// </summary>
        Paused = 1 << 2,   // Binary: 0100 (4)

        /// <summary>
        /// The game has ended or the player has lost.
        /// </summary>
        GameOver = 1 << 3, // Binary: 1000 (8)

        /// <summary>
        /// The game is in a loading state.
        /// </summary>
        Loading = 1 << 4   // Binary: 10000 (16)
    }

    /// <summary>
    /// Manages the game's state transitions and provides mechanisms to save and load the game state asynchronously.
    /// This class uses thread-safe operations and integrates with the UtilityJSON for file-based JSON serialization.
    /// </summary>
    public class StateMachine
    {
        // File path constants for saving and loading the game state
        private const string SaveFileName = "RareIconGameSave.json"; // JSON file name for saving state
        private static readonly string SaveFilePath = Application.persistentDataPath + "/"; // Save directory path
        private static readonly string FullSavePath = SaveFilePath + SaveFileName; // Full file path

        // Lock object to ensure thread-safe access to shared resources
        private readonly object _stateLock = new object();

        // Private field to hold the current game state
        private GameState _currentState;

        /// <summary>
        /// Gets or sets the current state of the game in a thread-safe manner.
        /// Modifications to this property are logged for debugging purposes.
        /// </summary>
        public GameState CurrentState
        {
            get
            {
                lock (_stateLock)
                {
                    return _currentState;
                }
            }
            private set
            {
                lock (_stateLock)
                {
                    _currentState = value;
                    Debug.Log($"Current state set to: {_currentState}");
                }
            }
        }

        /// <summary>
        /// Initializes a new instance of the <see cref="StateMachine"/> class with an optional initial state.
        /// If no state is specified, the state defaults to <see cref="GameState.None"/>.
        /// The game state is loaded asynchronously upon initialization.
        /// </summary>
        /// <param name="initialState">The initial state of the game. Defaults to <see cref="GameState.None"/>.</param>
        public StateMachine(GameState initialState = GameState.None)
        {
            LoadGameStateAsync().Forget(); // Load game state asynchronously without awaiting in constructor
            lock (_stateLock)
            {
                if (_currentState == GameState.None)
                {
                    _currentState = initialState;
                }
            }
        }

        /// <summary>
        /// Asynchronously changes the current game state and saves the new state to the file system.
        /// </summary>
        /// <param name="newState">The new game state to transition to.</param>
        /// <returns>A <see cref="UniTask"/> representing the asynchronous operation.</returns>
        public async UniTask ChangeStateAsync(GameState newState)
        {
            lock (_stateLock)
            {
                CurrentState = newState;
            }
            await SaveGameStateAsync();
        }

        /// <summary>
        /// Asynchronously saves the current game state to a JSON file using <see cref="UtilityJSON"/>.
        /// </summary>
        /// <returns>A <see cref="UniTask"/> representing the asynchronous save operation.</returns>
        private async UniTask SaveGameStateAsync()
        {
            SaveData saveData;
            lock (_stateLock)
            {
                saveData = new SaveData { gameState = _currentState };
            }

            string json = await UtilityJSON.ToJSONAsync(saveData);

            if (!string.IsNullOrEmpty(json))
            {
                bool success = await UtilityJSON.WriteFileAsync(FullSavePath, json);
                if (success)
                    Debug.Log("GameState saved to file successfully: " + FullSavePath);
            }
        }

        /// <summary>
        /// Asynchronously loads the game state from a JSON file using <see cref="UtilityJSON"/>.
        /// If the file does not exist or the contents cannot be parsed, the state defaults to <see cref="GameState.None"/>.
        /// </summary>
        /// <returns>A <see cref="UniTask"/> representing the asynchronous load operation.</returns>
        private async UniTask LoadGameStateAsync()
        {
            string json = await UtilityJSON.ReadFileAsync(FullSavePath);

            if (!string.IsNullOrEmpty(json))
            {
                SaveData saveData = await UtilityJSON.ParseJSONAsync<SaveData>(json);
                if (saveData != null)
                {
                    lock (_stateLock)
                    {
                        _currentState = saveData.gameState;
                    }
                    Debug.Log("GameState loaded successfully from file: " + FullSavePath);
                }
                else
                {
                    Debug.LogWarning("Loaded data is null. Using default game state.");
                    lock (_stateLock)
                    {
                        _currentState = GameState.None;
                    }
                }
            }
            else
            {
                Debug.LogWarning("Failed to load or parse JSON. Using default game state.");
                lock (_stateLock)
                {
                    _currentState = GameState.None;
                }
            }
        }

        /// <summary>
        /// Serializable class used for saving and loading game state data.
        /// </summary>
        [Serializable]
        private class SaveData
        {
            /// <summary>
            /// The current state of the game.
            /// </summary>
            public GameState gameState;
        }
    }
}
