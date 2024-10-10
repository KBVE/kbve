using System;
using System.IO;
using UnityEngine;
using Cysharp.Threading.Tasks;

namespace KBVE.Kilonet.States
{

    [Flags]
    public enum GameState
    {
        None = 0,
        MainMenu = 1 << 0,
        Playing = 1 << 1,
        Paused = 1 << 2,
        GameOver = 1 << 3,
        Loading = 1 << 4
    }

    public class StateMachine
    {
        private const string SaveFileName = "RareIconGameSave.json"; // JSON file name for saving state
        private static readonly string SaveFilePath = Application.persistentDataPath + "/"; // Save directory path
        private static readonly string FullSavePath = SaveFilePath + SaveFileName; // Full file path

        private readonly object _stateLock = new object();

        private GameState _currentState;

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


        public async UniTask ChangeStateAsync(GameState newState)
        {
            lock (_stateLock)
            {
                CurrentState = newState;
            }
            await SaveGameStateAsync();
        }

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

        private class SaveData
        {
            public GameState gameState;
        }
    }
}
