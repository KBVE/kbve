using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Caches the main camera reference. Registered as singleton in RootLifetimeScope.
    /// All systems that need the camera inject this instead of calling Camera.main.
    /// </summary>
    public class CameraService
    {
        Camera _camera;
        Transform _transform;

        public Camera Camera
        {
            get
            {
                if (_camera == null) Refresh();
                return _camera;
            }
        }

        public Transform Transform
        {
            get
            {
                if (_transform == null) Refresh();
                return _transform;
            }
        }

        public void Refresh()
        {
            _camera = Camera.main;
            _transform = _camera != null ? _camera.transform : null;
        }
    }
}
