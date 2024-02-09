using KBVE.Services;
using UnityEngine;

public class BootUp : MonoBehaviour
{
  void Awake()
  {

    //! Quick Patch - NEEDS TO BE REMOVED DURING OPTIMIZATION
    DontDestroyOnLoad(gameObject);

    // Ensure the Services instance is ready or initialized
    var servicesInstance = Services.Instance;

    // Register AuthenticationService
    var authService = gameObject.AddComponent<AuthenticationService>();
    Services.Instance.RegisterService<IAuthenticationService>(authService);

    // Register SceneLoaderService
    var sceneLoaderService = gameObject.AddComponent<SceneLoaderService>();
    Services.Instance.RegisterService<ISceneLoaderService>(sceneLoaderService);

    // Register UserDataService
    var userDataService = gameObject.AddComponent<UserDataService>();
    Services.Instance.RegisterService<IUserDataService>(userDataService);

    // Register APIRequestService
    var apiService = gameObject.AddComponent<APIRequestService>();
    Services.Instance.RegisterService<IAPIRequestService>(apiService);

  }
}
