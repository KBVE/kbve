using UnityEngine;
using VContainer;
using VContainer.Unity;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.Feedbacks;
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

    [SerializeField]
    private MMTimeManager timeManagerPrefab;

    [SerializeField]
    private GameObject cameraPrefab;


    protected override void Configure(IContainerBuilder builder)
    {

      // Instantiate and Register Camera Prefab
      var cameraInstance = Object.Instantiate(cameraPrefab);
      cameraInstance.transform.parent = null;
      builder.RegisterInstance(cameraInstance).AsSelf();
      DontDestroyOnLoad(cameraInstance);

      builder.RegisterComponentInNewPrefab<GameManager>(gameManagerPrefab, Lifetime.Scoped).DontDestroyOnLoad();
      builder.RegisterComponentInNewPrefab<MMTimeManager>(timeManagerPrefab, Lifetime.Singleton).DontDestroyOnLoad();
      // builder.RegisterComponentInNewPrefab<GameObject>(cameraPrefab, Lifetime.Singleton).DontDestroyOnLoad();

      builder.RegisterEntryPoint<GameManagerEntryPoint>();
      builder.RegisterEntryPoint<TimeManagerEntryPoint>();
      // builder.RegisterEntryPoint<CameraManagerEntryPoint>();

    }
  }
}
