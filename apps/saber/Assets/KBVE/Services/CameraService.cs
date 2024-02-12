using UnityEngine;
using Cinemachine;
using System.Collections.Generic;
using UnityEngine.SceneManagement;

namespace KBVE.Services
{
    public interface ICameraService
    {
        void SwitchToCamera(CinemachineVirtualCamera targetCamera);
    }

    public class CameraService : MonoBehaviour, ICameraService
    {
        public static CameraService Instance { get; private set; }

        private CinemachineBrain _cinemachineBrain;
        private List<CinemachineVirtualCamera> _virtualCameras = new List<CinemachineVirtualCamera>();

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
            }
            else
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);

                SceneManager.sceneLoaded += OnSceneLoaded;
                SetupCinemachineBrain();
            }
        }

        private void OnDestroy()
        {
            SceneManager.sceneLoaded -= OnSceneLoaded;
        }

        private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
        {
            SetupCinemachineBrain();
        }

        private void SetupCinemachineBrain()
        {
            _cinemachineBrain = FindObjectOfType<CinemachineBrain>();
            if (_cinemachineBrain == null)
            {
                Camera mainCamera = Camera.main;
                if (mainCamera == null)
                {
                    GameObject cameraGameObject = new GameObject("Main Camera");
                    mainCamera = cameraGameObject.AddComponent<Camera>();
                    cameraGameObject.tag = "MainCamera";
                }
                _cinemachineBrain = mainCamera.gameObject.AddComponent<CinemachineBrain>();
            }
        }

        public void SwitchToCamera(CinemachineVirtualCamera targetCamera)
        {
            foreach (var cam in _virtualCameras)
            {
                cam.gameObject.SetActive(cam == targetCamera);
            }
            if (!_virtualCameras.Contains(targetCamera))
            {
                _virtualCameras.Add(targetCamera);
            }
        }

        // Use this method to register virtual cameras with the service, for example, when they're instantiated.
        public void RegisterVirtualCamera(CinemachineVirtualCamera virtualCamera)
        {
            if (!_virtualCameras.Contains(virtualCamera))
            {
                _virtualCameras.Add(virtualCamera);
            }
        }

        // Optionally, a method to unregister virtual cameras if they are destroyed or no longer needed.
        public void UnregisterVirtualCamera(CinemachineVirtualCamera virtualCamera)
        {
            if (_virtualCameras.Contains(virtualCamera))
            {
                _virtualCameras.Remove(virtualCamera);
            }
        }
    }
}
