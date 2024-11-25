using KBVE.Kilonet;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using VContainer;
using VContainer.Unity;

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
      builder.RegisterComponentInNewPrefab(gameManagerPrefab, Lifetime.Scoped).DontDestroyOnLoad();

      // Register the EntryPoint for GameManager initialization
      builder.RegisterEntryPoint<GameManagerEntryPoint>();
    }
  }
}
