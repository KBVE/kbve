using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.Shaco
{
    public class CameraManagerEntryPoint : IStartable
    {
        private readonly GameObject _cameraSystem;

        public CameraManagerEntryPoint(GameObject cameraSystem)
        {
            _cameraSystem = cameraSystem;
        }

        public void Start()
        {
            Debug.Log("Camera System initialized.");
        }
    }
}
