using UnityEngine;
using VContainer;
using VContainer.Unity;
// TODO: Cinemachine3.1 Integration.
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
            Debug.Log("TODO - Camera Manager initialized.");
        }
    }
}
