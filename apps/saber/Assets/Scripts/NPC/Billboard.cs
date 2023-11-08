using UnityEngine;

public class Billboard : MonoBehaviour
{
    private Camera mainCamera;

    // Method to set the camera reference from outside
    public void SetCamera(Camera camera)
    {
        mainCamera = camera;
    }

    void LateUpdate()
    {
        // Ensure the sprite is always facing the camera
        if (mainCamera)
        {
            transform.LookAt(transform.position + mainCamera.transform.rotation * Vector3.forward,
                mainCamera.transform.rotation * Vector3.up);
        }
    }
}
