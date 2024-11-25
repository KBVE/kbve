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
      // Register GameManager as a MonoBehaviour
      builder.RegisterComponent<GameManager>(resolver =>
      {
        var instance = Object.Instantiate(gameManagerPrefab).GetComponent<GameManager>();
        DontDestroyOnLoad(instance.gameObject);
        return instance;
      });

      // Register the EntryPoint for initializing GameManager
      builder.RegisterEntryPoint<GameManagerEntryPoint>();

      // builder.Register<NetworkManager>(Lifetime.Singleton);
      // builder.Register<PlayerManager>(Lifetime.Singleton);

      // builder.Register<LevelManager>(Lifetime.Singleton).WithParameter(localPlayerPrefab);
      // builder.Register<MultiplayerManager>(Lifetime.Singleton).WithParameter(remotePlayerPrefab);

      // builder.Register<PlayerPool>(Lifetime.Singleton).WithParameter(remotePlayerPrefab);
    }
  }
}
