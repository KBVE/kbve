using System.Collections;
using System.Collections.Generic;
using Cinemachine;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace KBVE.Services
{
  public interface ICameraService
  {
    void SwitchToCamera(CinemachineVirtualCamera targetCamera);
    void BlendToCamera(CinemachineVirtualCamera targetCamera, float blendDuration);
    void ShakeCamera(float intensity, float duration);
    void LockCameraToTarget(Transform target, float lockTime = -1);
    void SetFieldOfView(float fov, float duration = 0);
    CinemachineVirtualCamera GetCurrentVirtualCamera();
    void SetCameraPosition(Vector3 position);
    void SetCameraRotation(Quaternion rotation);
    Vector3 GetCameraForward();
    void RegisterVirtualCamera(CinemachineVirtualCamera virtualCamera);
    void UnregisterVirtualCamera(CinemachineVirtualCamera virtualCamera);
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
        return;
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
      if (targetCamera == null)
      {
        Debug.LogWarning("Target camera is null.");
        return;
      }

      foreach (var cam in _virtualCameras)
      {
        if (cam != null)
        {
          cam.gameObject.SetActive(cam == targetCamera);
        }
      }
      if (!_virtualCameras.Contains(targetCamera))
      {
        _virtualCameras.Add(targetCamera);
      }
    }

    // Use this method to register virtual cameras with the service, for example, when they're instantiated.
    public void RegisterVirtualCamera(CinemachineVirtualCamera virtualCamera)
    {
      if (virtualCamera == null)
      {
        Debug.LogWarning("Virtual camera to register is null.");
        return;
      }

      if (!_virtualCameras.Contains(virtualCamera))
      {
        _virtualCameras.Add(virtualCamera);
      }
    }

    // Optionally, a method to unregister virtual cameras if they are destroyed or no longer needed.
    public void UnregisterVirtualCamera(CinemachineVirtualCamera virtualCamera)
    {
      if (virtualCamera == null)
      {
        Debug.LogWarning("Virtual camera to unregister is null.");
        return;
      }

      if (_virtualCameras.Contains(virtualCamera))
      {
        _virtualCameras.Remove(virtualCamera);
      }
    }

    public Vector3 GetCameraForward()
    {
      if (_cinemachineBrain != null && _cinemachineBrain.ActiveVirtualCamera != null)
      {
        GameObject vcamGameObject = _cinemachineBrain.ActiveVirtualCamera.VirtualCameraGameObject;
        if (vcamGameObject != null)
        {
          Vector3 forward = vcamGameObject.transform.forward;
          forward.y = 0; // Optionally flatten the vector if you don't want vertical movement
          return forward.normalized;
        }
      }
      Debug.LogWarning(
        "Active virtual camera not found. Returning Vector3.forward as a default forward direction."
      );
      return Vector3.forward; // This ensures a default forward direction is provided, even if no camera is found.
    }

    public void BlendToCamera(CinemachineVirtualCamera targetCamera, float blendDuration)
    {
      if (targetCamera == null)
      {
        Debug.LogError("BlendToCamera: Target camera is null.");
        return;
      }

      if (_cinemachineBrain == null)
      {
        Debug.LogError("BlendToCamera: CinemachineBrain is not found.");
        return;
      }

      _cinemachineBrain.m_DefaultBlend.m_Time = blendDuration;
      SwitchToCamera(targetCamera);
    }

    public void ShakeCamera(float intensity, float duration)
    {
      var currentVCam = GetCurrentVirtualCamera();
      if (currentVCam == null)
      {
        Debug.LogError("ShakeCamera: Current virtual camera is null.");
        return;
      }

      var noise =
        currentVCam.GetCinemachineComponent<Cinemachine.CinemachineBasicMultiChannelPerlin>();
      if (noise == null)
      {
        Debug.LogError("ShakeCamera: CinemachineBasicMultiChannelPerlin component not found.");
        return;
      }

      noise.m_AmplitudeGain = intensity;
      StartCoroutine(StopShake(duration, noise));
    }

    private IEnumerator StopShake(
      float duration,
      Cinemachine.CinemachineBasicMultiChannelPerlin noise
    )
    {
      yield return new WaitForSeconds(duration);
      if (noise == null)
      {
        Debug.LogWarning("StopShake: CinemachineBasicMultiChannelPerlin is null after waiting.");
        yield break; // Exit the coroutine early if the noise reference is lost.
      }

      noise.m_AmplitudeGain = 0;
    }

    public void LockCameraToTarget(Transform target, float lockTime = -1)
    {
      if (target == null)
      {
        Debug.LogError("LockCameraToTarget: Target is null.");
        return;
      }

      var vcam = GetCurrentVirtualCamera();
      if (vcam == null)
      {
        Debug.LogError("LockCameraToTarget: Current virtual camera is null.");
        return;
      }

      vcam.LookAt = target;
      vcam.Follow = target;

      if (lockTime > 0)
      {
        StartCoroutine(UnlockCameraAfterTime(lockTime));
      }
    }

    private IEnumerator UnlockCameraAfterTime(float time)
    {
      yield return new WaitForSeconds(time); // Wait for the specified time
      var vcam = GetCurrentVirtualCamera(); // Retrieve the current virtual camera

      // Check if the retrieved virtual camera is not null
      if (vcam == null)
      {
        Debug.LogError("UnlockCameraAfterTime: Failed to retrieve the current virtual camera.");
        yield break; // Exit the coroutine if no virtual camera is found
      }

      // Safely set the LookAt and Follow properties to null
      vcam.LookAt = null;
      vcam.Follow = null;
    }

    public void SetFieldOfView(float fov, float duration = 0)
    {
      var vcam = GetCurrentVirtualCamera();
      if (vcam == null)
      {
        Debug.LogError("SetFieldOfView: Current virtual camera is null.");
        return;
      }

      if (duration > 0)
      {
        StartCoroutine(AdjustFOV(vcam, fov, duration));
      }
      else
      {
        vcam.m_Lens.FieldOfView = fov;
      }
    }

    private IEnumerator AdjustFOV(CinemachineVirtualCamera vcam, float targetFOV, float duration)
    {
      if (vcam == null)
      {
        Debug.LogError("AdjustFOV: The CinemachineVirtualCamera is null.");
        yield break; // Stop the coroutine if the virtual camera is null.
      }

      if (duration <= 0)
      {
        Debug.LogWarning("AdjustFOV: Duration must be greater than zero. Setting FOV directly.");
        vcam.m_Lens.FieldOfView = targetFOV; // Directly set the FOV if duration is not valid.
        yield break; // Exit the coroutine.
      }

      float startFOV = vcam.m_Lens.FieldOfView;
      float time = 0;

      while (time < duration)
      {
        // Ensures that the virtual camera is still valid during the adjustment period.
        if (vcam == null)
        {
          Debug.LogWarning(
            "AdjustFOV: The CinemachineVirtualCamera became null during FOV adjustment."
          );
          yield break; // Exit the coroutine if the camera becomes null during the process.
        }

        vcam.m_Lens.FieldOfView = Mathf.Lerp(startFOV, targetFOV, time / duration);
        time += Time.deltaTime;
        yield return null;
      }

      if (vcam != null) // Double-check in case the camera was destroyed during the last yield.
      {
        vcam.m_Lens.FieldOfView = targetFOV;
      }
    }

    public CinemachineVirtualCamera GetCurrentVirtualCamera()
    {
      if (_cinemachineBrain == null)
      {
        Debug.LogError("GetCurrentVirtualCamera: CinemachineBrain is not found.");
        return null;
      }

      if (_cinemachineBrain.ActiveVirtualCamera == null)
      {
        Debug.LogWarning("GetCurrentVirtualCamera: There is no active virtual camera.");
        return null;
      }

      var currentVCam = _cinemachineBrain.ActiveVirtualCamera as CinemachineVirtualCamera;
      if (currentVCam == null)
      {
        Debug.LogWarning(
          "GetCurrentVirtualCamera: The active virtual camera is not a CinemachineVirtualCamera."
        );
        // This might not necessarily be an error, as the ActiveVirtualCamera could be of a different type,
        // but it's often worth logging a warning if you're expecting a CinemachineVirtualCamera.
      }

      return currentVCam;
    }

    public void SetCameraPosition(Vector3 position)
    {
      var vcam = GetCurrentVirtualCamera();
      if (vcam == null)
      {
        Debug.LogWarning("No current virtual camera found.");
        return;
      }

      vcam.transform.position = position;
    }

    public void SetCameraRotation(Quaternion rotation)
    {
      var vcam = GetCurrentVirtualCamera();
      if (vcam == null)
      {
        Debug.LogWarning("No current virtual camera found.");
        return;
      }

      vcam.transform.rotation = rotation;
    }
  }
}
