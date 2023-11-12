using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    [Header("Settings")]
    [Tooltip("Max speed the player can reach when walking")]
    [SerializeField] float walkSpeed = 5f;

    [Tooltip("Max speed the player can reach when running")]
    [SerializeField] float runSpeed = 8f;

    [Tooltip("Drag that is applied when the player is on the ground")]
    [SerializeField] float groundDrag = 5;

    [Tooltip("Amount of force to apply when jumping")]
    [SerializeField] float jumpForce = 5f;
    [Tooltip("Factor that is multiplied with the global gravity to determine the gravity for this object")]
    [SerializeField] float gravityScale = -8f;
    [Tooltip("Cooldown between jumps")]
    [SerializeField] float jumpCoolDown = 0.2f;

    [Tooltip("Slows/speeds player movement while in the air")]
    [SerializeField] float airMultiplier = 0.5f;

    [Tooltip("Speed at which the player model will turn towards new movement direction")]
    [SerializeField] float rotationSpeed = 7f;

    [Space(5)]

    [Tooltip("Should be any layer the player can stand and jump from")]
    [SerializeField] LayerMask groundLayer;

    [Tooltip("Offset from the center of the player gameObject to his feet")]
    [SerializeField] float groundOffset = 2f;

    [Tooltip("Radius of the checkSphere below the players feet")]
    [SerializeField] float groundedRadius;
    bool isGrounded;

    [Space(5)]

    [Tooltip("Max slope angle that the player can comfortably climb")]
    [SerializeField] float maxSlopeAngle = 40f;

    [Space(5)]

    [Tooltip("Key to make the player jump")]
    [SerializeField] KeyCode jumpKey = KeyCode.Space;

    [Tooltip("Key to make the player sprint")]
    [SerializeField] KeyCode sprintKey = KeyCode.LeftShift;

    [Header("References")]
    Rigidbody rb;
    Camera cam;
    Animator animator;

    [Header("Private Vars")]
    Vector3 moveDir; // Direction of the player's movement
    float moveSpeed; // current allowed max player speed
    float horiz; // Horizontal input
    float vert; // Vertical input
    bool running; // Is the player running
    bool jumping; // Is the player jumping
    bool canJump = true; // can the player jump
    RaycastHit slopeHit; // Hit information for the slope

  #region Pablo

  private AudioSource _dragonSource;
  [SerializeField] AudioClip[] jump;


  #endregion

  [Tooltip("Player's current movement state")]
    public MovementState state;
    public enum MovementState
    {
        walking,
        sprinting,
        air
    }

    void Awake()
    {
        rb = GetComponent<Rigidbody>();
        cam = Camera.main;
        animator = GetComponent<Animator>();
        Cursor.lockState = CursorLockMode.Locked;
    #region Pablo
    _dragonSource = GetComponent<AudioSource>();
    #endregion
  }

  // Update is called once per frame
  void Update()
    {
        isGrounded = GroundCheck(); // checks if player is on ground
        animator.SetBool("Grounded", isGrounded);

        GetInput(); // Gets player movement input
        SpeedControl(); // Makes sure player is not moving faster then his max speed
        RotatePlayer(); // Rotates the player to align with movement direction
        StateHandler(); // Controls if the player is walking or running

        rb.drag = isGrounded ? groundDrag : 0f; // If the player is on the ground apply ground drag else don't apply drag
    }

    void GetInput()
    {
        horiz = Input.GetAxis("Horizontal");
        vert = Input.GetAxis("Vertical");

        jumping = Input.GetKey(jumpKey);
        running = Input.GetKey(sprintKey);
    }

    void SpeedControl()
    {
        if (OnSlope())
        {
            if (rb.velocity.magnitude > moveSpeed)
            {
                rb.velocity = rb.velocity.normalized * moveSpeed;
            }
        }
        else
        {
            Vector3 flatVel = VectorUtility.FlattenVector(rb.velocity);

            if (flatVel.magnitude > moveSpeed)
            {
                Vector3 limitedVel = flatVel.normalized * moveSpeed;
                rb.velocity = new Vector3(limitedVel.x, rb.velocity.y, limitedVel.z);
            }
        }
    }

    void RotatePlayer()
    {
        if (moveDir != Vector3.zero)
        {
            Quaternion toRotation = Quaternion.LookRotation(moveDir, Vector3.up);
            transform.rotation = Quaternion.Lerp(transform.rotation, toRotation, rotationSpeed * Time.deltaTime);
        }
    }

    void StateHandler()
    {
        animator.SetFloat("Speed", rb.velocity.magnitude);
        if(isGrounded && running)
        {
            state = MovementState.sprinting;
            moveSpeed = runSpeed;
        }
        else if(isGrounded)
        {
            state = MovementState.walking;
            moveSpeed = walkSpeed;
        }
        else
        {
            state = MovementState.air;
        }
    }

    void FixedUpdate()
    {
        MovePlayer();

        if (jumping && canJump && isGrounded)
        {
            canJump = false;
            Jump();
            Invoke(nameof(ResetJump), jumpCoolDown);
        }
    }

    void MovePlayer()
    {
        Vector3 inputDir = new Vector3(horiz, 0, vert);

        Vector3 camForward = cam.transform.forward;
        Vector3 camRight = cam.transform.right;

        camForward.y = 0;
        camForward.Normalize();
        camRight.y = 0;
        camRight.Normalize();

        moveDir = inputDir.z * camForward + inputDir.x * camRight;

        Debug.DrawRay(transform.position + transform.up * 1, moveDir);

        rb.useGravity = !OnSlope();

        if (OnSlope())
        {
            rb.AddForce(GetSlopeMoveDirection() * moveSpeed * 5, ForceMode.Force);
            return;
        }

        if (isGrounded)
            rb.AddForce(moveDir.normalized * moveSpeed * 10f, ForceMode.Force);

        else if (!isGrounded)
            rb.AddForce(moveDir.normalized * moveSpeed * 10f * airMultiplier, ForceMode.Force);

    }

    void Jump()
    {
        rb.velocity = VectorUtility.FlattenVector(rb.velocity);
        float initialVelocity = Mathf.Sqrt(-2f * gravityScale * jumpForce);
        rb.AddForce(transform.up * initialVelocity, ForceMode.Impulse);
        animator.SetTrigger("Jump");
    // #region Pablo
    // _dragonSource.PlayOneShot(jump[Random.Range(0, jump.Length)]);
    // #endregion
    #region HolyPablo
    if (jump != null && jump.Length > 0)
    {
        _dragonSource.PlayOneShot(jump[Random.Range(0, jump.Length)]);
    }
    else
    {
       // Debug.LogWarning("Jump sound array is empty or not initialized.");
    }
    #endregion
  }
  void ResetJump()
    {
        canJump = true;
    }


    bool GroundCheck()
    {
        Vector3 spherePosition = new Vector3(transform.position.x, transform.position.y + groundOffset,
        transform.position.z);
        return Physics.CheckSphere(spherePosition, groundedRadius, groundLayer, QueryTriggerInteraction.Ignore);
    }
    bool OnSlope()
    {
        if (!isGrounded) return false;
        if (Physics.Raycast(transform.position, Vector3.down, out slopeHit, 4f))
        {
            float angle = Vector3.Angle(Vector3.up, slopeHit.normal);
            return angle < maxSlopeAngle && angle != 0;
        }
        return false;
    }
    Vector3 GetSlopeMoveDirection()
    {
        return Vector3.ProjectOnPlane(moveDir, slopeHit.normal);
    }

    void OnDrawGizmosSelected()
    {
        Vector3 spherePosition = new Vector3(transform.position.x, transform.position.y + groundOffset,
        transform.position.z);
        Gizmos.color = new Color(0, 1, 0, 0.2f);
        Gizmos.DrawSphere(spherePosition, groundedRadius);
    }
}
