using UnityEngine;
using VContainer;
using VContainer.Unity;
using MoreMountains.TopDownEngine;

namespace KBVE.MMExtensions.Shaco
{
    public class GameManagerEntryPoint : IStartable
    {
        private readonly GameManager _gameManager;

        public GameManagerEntryPoint(GameManager gameManager)
        {
            _gameManager = gameManager;
        }

        public void Start()
        {
            // Initialize GameManager values
            _gameManager.TargetFrameRate = 60;
            _gameManager.MaximumLives = 5;
            _gameManager.CurrentLives = 5;
            _gameManager.GameOverScene = "GameOver";

            Debug.Log("GameManager initialized via EntryPoint!");
        }
    }
}