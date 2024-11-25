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

    [SerializeField]
    private GameObject gameManagerPrefab;


    protected override void Configure(IContainerBuilder builder)
    {
      // Register GameManager
      builder.Register<GameManager>(Lifetime.Singleton, resolver =>
      {
          var instance = Object.Instantiate(gameManagerPrefab).GetComponent<GameManager>();
          
          // Set initial values
          instance.TargetFrameRate = 60;
          instance.MaximumLives = 3;
          instance.CurrentLives = 3;

          DontDestroyOnLoad(instance.gameObject);

          return instance;
      });

      // builder.Register<NetworkManager>(Lifetime.Singleton);
      // builder.Register<PlayerManager>(Lifetime.Singleton);

      // builder.Register<LevelManager>(Lifetime.Singleton).WithParameter(localPlayerPrefab);
      // builder.Register<MultiplayerManager>(Lifetime.Singleton).WithParameter(remotePlayerPrefab);

      // builder.Register<PlayerPool>(Lifetime.Singleton).WithParameter(remotePlayerPrefab);
    }
  }
}
