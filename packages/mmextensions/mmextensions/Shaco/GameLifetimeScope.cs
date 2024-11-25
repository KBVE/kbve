using UnityEngine;
using VContainer;
using VContainer.Unity;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using KBVE.Kilonet;

namespace KBVE.MMExtensions.Shaco
{
  public class GameLifetimeScope : LifetimeScope
  {
    [SerializeField]
    private GameObject localPlayerPrefab;

    [SerializeField]
    private GameObject remotePlayerPrefab;

    protected override void Configure(IContainerBuilder builder)
    {
      // Register GameManager

      builder
        .RegisterComponentInHierarchy<GameManager>()
        .OnInitialized(
          (resolver, gameManager) =>
          {
            gameManager.TargetFrameRate = 300;
            gameManager.MaximumLives = 0;
            gameManager.CurrentLives = 0;
            gameManager.GameOverScene = "Title";
            gameManager.PauseGameWhenInventoryOpens = false;
          }
        );




      // builder.Register<NetworkManager>(Lifetime.Singleton);
      // builder.Register<PlayerManager>(Lifetime.Singleton);

      // builder.Register<LevelManager>(Lifetime.Singleton).WithParameter(localPlayerPrefab);
      // builder.Register<MultiplayerManager>(Lifetime.Singleton).WithParameter(remotePlayerPrefab);

      // builder.Register<PlayerPool>(Lifetime.Singleton).WithParameter(remotePlayerPrefab);
    }
  }
}
