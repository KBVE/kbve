using UnityEngine;

public class Billboard : MonoBehaviour
{
    private Camera mainCamera;

    // Method to set the camera reference from outside
    public void SetCamera(Camera camera)
    {
        mainCamera = camera;
    }

    void Update()
    {
        if (mainCamera)
        {
            transform.forward = mainCamera.transform.forward;
        }
    }
}
