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
      builder.UseComponents(components =>
      {
        var gameManager = Object.Instantiate(gameManagerPrefab).GetComponent<GameManager>();
        DontDestroyOnLoad(gameManager.gameObject);
        components.AddInstance(gameManager);

      });

      // Register the EntryPoint for GameManager initialization
      builder.RegisterEntryPoint<GameManagerEntryPoint>();
    }
  }
}
