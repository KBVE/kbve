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
            _gameManager.TargetFrameRate = 60;
            _gameManager.MaximumLives = 1;
            _gameManager.CurrentLives = 1;
            _gameManager.GameOverScene = "Title";

            Debug.Log("GameManager initialized via EntryPoint!");
        }
    }
}
