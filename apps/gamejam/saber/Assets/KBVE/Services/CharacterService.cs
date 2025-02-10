using UnityEngine;
using UnityEngine.InputSystem;

namespace KBVE.Services
{
  public interface ICharacterService
  {
    void Move(Vector3 direction);
    void Look(Vector2 rotation);
    void Jump();
    void Shoot();
  }

  public class CharacterService : MonoBehaviour, ICharacterService
  {
    public static CharacterService Instance { get; private set; }

    private CameraService _cameraService;

    public float moveSpeed = 5f; // Speed of movement
    private bool isGrounded; // Is the character on the ground

    [SerializeField]
    private float jumpForce = 5f;

    [SerializeField]
    private LayerMask groundLayer;

    [SerializeField]
    private PlayerInput playerInput;
    private InputAction moveAction,
      lookAction,
      jumpAction,
      shootAction;

    [SerializeField]
    private Rigidbody rb; // Assuming you are using a Rigidbody for physics-based movement

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

        InitializeActions();
      }
    }

    private void Start()
    {
      // Access the CameraService instance
      _cameraService = CameraService.Instance;

      // Example usage
      SetupCamera();
    }

    private void SetupCamera()
    {
      // Assuming you have a method to find or decide which camera to use
      var targetCamera = FindTargetCamera();
      if (targetCamera != null)
      {
        _cameraService.SwitchToCamera(targetCamera);
      }
    }

    private Cinemachine.CinemachineVirtualCamera FindTargetCamera()
    {
      // Implement logic to find the appropriate camera
      // This could be based on game state, player preferences, etc.
      // For demonstration, return null
      return null;
    }

    private void InitializeActions()
    {
      moveAction = playerInput.actions["Move"];
      lookAction = playerInput.actions["Look"];
      jumpAction = playerInput.actions["Jump"];
      shootAction = playerInput.actions["Shoot"];

      jumpAction.performed += context => Jump();
      shootAction.performed += context => Shoot();
    }

    private void OnEnable()
    {
      moveAction.Enable();
      lookAction.Enable();
      jumpAction.Enable();
      shootAction.Enable();
    }

    private void OnDisable()
    {
      moveAction.Disable();
      lookAction.Disable();
      jumpAction.Disable(); // Disable jump action
      shootAction.Disable();
    }

    private void Update()
    {
      Vector2 moveInput = moveAction.ReadValue<Vector2>();
      Vector2 lookInput = lookAction.ReadValue<Vector2>();

      Move(moveInput);
      Look(lookInput);
    }

    public void Move(Vector3 direction)
    {
      if (_cameraService == null)
      {
        Debug.LogError("CameraService is not assigned.");
        return;
      }

      // Use the camera's forward and right vectors to determine the movement direction
      Vector3 forward = _cameraService.GetCameraForward();
      Vector3 right = Vector3.Cross(Vector3.up, forward).normalized;
      Vector3 moveDirection = (forward * direction.z + right * direction.x).normalized;

      if (moveDirection.magnitude > 1)
        moveDirection.Normalize(); // Ensure consistent speed in all directions

      // Apply the movement
      Vector3 movement = moveDirection * moveSpeed * Time.deltaTime;
      rb.MovePosition(rb.position + movement);
    }

    public void Look(Vector2 rotation)
    {
      // Implement character look/rotation logic here
    }

    public void Jump()
    {
      // Implement jump logic here
      // Make sure to check if the character is grounded before applying force
      if (IsGrounded())
      {
        rb.AddForce(Vector3.up * jumpForce, ForceMode.VelocityChange);
      }
    }

    public void Shoot()
    {
      // Implement shooting logic here
      Debug.Log("Shoot action performed");
    }

    private bool IsGrounded()
    {
      // Implement ground check logic
      // Example: return Physics.Raycast(transform.position, -Vector3.up, distanceToGround + 0.1f);
      return true; // Placeholder
    }
  }
}
