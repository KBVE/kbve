using KBVE.Services;
using UnityEngine;

namespace KBVE.Engine
{
  public class EngineInitializer : MonoBehaviour
  {
    void Awake()
    {
      InitializeServices();
    }

    private void InitializeServices()
    {
      DontDestroyOnLoad(gameObject);

      var servicesInstance = KBVE.Services.Services.Instance;

      //  Register AuthenticationService
      var authService = gameObject.AddComponent<AuthenticationService>();
      servicesInstance.RegisterService<IAuthenticationService>(authService);

      //  Register SceneLoaderService
      var sceneLoaderService = gameObject.AddComponent<SceneLoaderService>();
      servicesInstance.RegisterService<ISceneLoaderService>(sceneLoaderService);

      //  Register UserDataService
      var userDataService = gameObject.AddComponent<UserDataService>();
      servicesInstance.RegisterService<IUserDataService>(userDataService);

      //  Register APIRequestService
      var apiService = gameObject.AddComponent<APIRequestService>();
      servicesInstance.RegisterService<IAPIRequestService>(apiService);

      //  Register CameraService
      var cameraService = gameObject.AddComponent<CameraService>();
      servicesInstance.RegisterService<ICameraService>(cameraService);

      //  Register Entity

      //  Register Weather
      var weatherService = gameObject.AddComponent<WeatherService>();
      servicesInstance.RegisterService<IWeatherService>(weatherService);
    }
  }
}
