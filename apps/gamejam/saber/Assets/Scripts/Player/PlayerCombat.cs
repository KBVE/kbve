using UnityEngine;

public class PlayerCombat : MonoBehaviour
{
  private Camera playerCamera;

  private void Start()
  {
    playerCamera = Player.Instance.PlayerCamera; // Get the camera from the Player instance
  }


}
