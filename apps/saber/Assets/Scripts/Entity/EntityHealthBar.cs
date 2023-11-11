using Cinemachine;
using UnityEngine;
using UnityEngine.UI;

public class EntityHealthBar : MonoBehaviour
{
  #region Heath Variables
  private Image healthBarImage; // Base Image for HealthBar
  private Canvas healthBarCanvas; // Canvas for HealthBar
  public Vector3 healthBarOffset = new Vector3(0, 2f, 0); // Offset the health bar above the Entity

  //private Camera mainCamera;
  private CinemachineVirtualCamera virtualCamera;
  public float smoothTime = 0.1f;
  private Quaternion targetRotation;

  #endregion

  #region InitializeHealthBar
  public void InitializeHealthBar(CinemachineVirtualCamera vCam)
  {
    virtualCamera = vCam; // Cache the virtual camera

    // Create the health bar canvas
    GameObject canvasGameObject = new GameObject("HealthBarCanvas");
    healthBarCanvas = canvasGameObject.AddComponent<Canvas>();
    healthBarCanvas.renderMode = RenderMode.WorldSpace;
    healthBarCanvas.worldCamera = Camera.main;

    // Set the size of the canvas
    RectTransform rt = canvasGameObject.GetComponent<RectTransform>();
    rt.sizeDelta = new Vector2(2, 0.4f);

    // Create the health bar image
    GameObject imageGameObject = new GameObject("HealthBarImage");
    imageGameObject.transform.SetParent(canvasGameObject.transform, false);
    healthBarImage = imageGameObject.AddComponent<Image>();
    healthBarImage.color = Color.red;
    healthBarImage.rectTransform.sizeDelta = new Vector2(2f, 0.2f);
    healthBarImage.type = Image.Type.Filled;
    healthBarImage.fillMethod = Image.FillMethod.Horizontal;

    // Position and parent the health bar canvas
    healthBarCanvas.transform.SetParent(transform);
    healthBarCanvas.transform.localPosition = healthBarOffset;

    // Billboard Effect
    //Vector3 cameraDirection = transform.position - mainCamera.transform.position;
    //cameraDirection.y = 0; // Keep the health bar's orientation horizontal
    //healthBarCanvas.transform.rotation = Quaternion.LookRotation(cameraDirection);
    if (virtualCamera != null)
    {
      Transform camTransform = virtualCamera.VirtualCameraGameObject.transform;

      // Align the health bar's forward vector with the camera's forward vector
      Vector3 forwardToCamera = -camTransform.forward;
      forwardToCamera.y = 0; // Flatten on the y-axis to prevent vertical tilt

      // Calculate the rotation to face the camera
      Quaternion faceCameraRotation = Quaternion.LookRotation(forwardToCamera);

      // Apply the rotation
      healthBarCanvas.transform.rotation = Quaternion.Euler(0, faceCameraRotation.eulerAngles.y, 0);
    }
  }
  #endregion

  public void SetHealth(float healthNormalized)
  {
    healthBarImage.fillAmount = healthNormalized;
  }

  #region Notes
  //!   11-10-2023 - 8:12pm EST - LastUpdate() -
  //   void LateUpdate()
  // {

  //     if (virtualCamera != null)
  //     {
  //         Transform camTransform = virtualCamera.VirtualCameraGameObject.transform;

  //         // Calculate the rotation to face the camera while staying flat
  //         Vector3 directionToCamera = camTransform.position - transform.position;
  //         directionToCamera.y = 0; // Flatten on the y-axis
  //         targetRotation = Quaternion.LookRotation(directionToCamera);
  //         targetRotation = Quaternion.Euler(0, targetRotation.eulerAngles.y, 0); // Only rotate on the y-axis

  //         // Smoothly interpolate the rotation
  //         healthBarCanvas.transform.rotation = Quaternion.Lerp(healthBarCanvas.transform.rotation, targetRotation, smoothTime * Time.deltaTime);
  //     }
  // }

  // void LateUpdate()
  //   {
  //       // Ensure the health bar always faces the camera
  //       if (mainCamera != null)
  //       {
  //           Vector3 cameraDirection = transform.position - mainCamera.transform.position;
  //           cameraDirection.y = 0; // Keep the health bar's orientation horizontal
  //           healthBarCanvas.transform.rotation = Quaternion.LookRotation(cameraDirection);
  //       }
  //   }

  #endregion
}
