//using Cinemachine;
using UnityEngine;
using UnityEngine.UI;

public class EntityHealthBar : MonoBehaviour
{
  #region Heath Variables
  private Image healthBarImage; // Base Image for HealthBar
  private Canvas healthBarCanvas; // Canvas for HealthBar
  public Vector3 healthBarOffset = new Vector3(0, 2f, 0); // Offset the health bar above the Entity

  private Camera mainCamera;
//private CinemachineVirtualCamera virtualCamera;
  public float smoothTime = 0.1f;
  private Quaternion targetRotation;

  #endregion

  #region InitializeHealthBar
  public void InitializeHealthBar()
  {
    // virtualCamera = vCam; // Cache the virtual camera
    mainCamera = Camera.main; // Cache the main Camera

    // Create the health bar canvas
    GameObject canvasGameObject = new GameObject("HealthBarCanvas");
    healthBarCanvas = canvasGameObject.AddComponent<Canvas>();
    healthBarCanvas.renderMode = RenderMode.WorldSpace;
    //healthBarCanvas.worldCamera = Camera.main; - Patch Atomic Unity Entity Health Bar 11-12-2023
    healthBarCanvas.worldCamera = mainCamera;

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


  }
  #endregion

  public void SetHealth(float healthNormalized)
  {
    healthBarImage.fillAmount = healthNormalized;
  }

  private void LateUpdate()
  {
    if (mainCamera != null)
    {
      Vector3 forwardToCamera = -mainCamera.transform.forward;
      forwardToCamera.y = 0;
      Quaternion faceCameraRotation = Quaternion.LookRotation(forwardToCamera);
      healthBarCanvas.transform.rotation = Quaternion.Euler(0, faceCameraRotation.eulerAngles.y, 0);
    }
  }

}
