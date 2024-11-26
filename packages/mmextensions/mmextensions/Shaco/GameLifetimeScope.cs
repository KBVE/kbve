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
    private GameManager gameManagerPrefab;

    protected override void Configure(IContainerBuilder builder)
    {
     
      builder.RegisterComponentInNewPrefab<GameManager>(gameManagerPrefab, Lifetime.Scoped).DontDestroyOnLoad();

      builder.RegisterEntryPoint<GameManagerEntryPoint>();
    }
  }
}
