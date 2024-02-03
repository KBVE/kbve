using UnityEngine;
using KBVE.Services;

public class BootUp : MonoBehaviour
{
    void Awake()
    {

        var servicesInstance = Services.Instance;

        var authService = gameObject.AddComponent<AuthenticationService>();
        Services.Instance.RegisterService<IAuthenticationService>(authService);

    }
}
