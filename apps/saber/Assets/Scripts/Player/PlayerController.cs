using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
public class PlayerController : MonoBehaviour
{
    [Header("Movement Settings")]
    [SerializeField] private float _walkSpeed;
    [SerializeField] private float _sprintSpeed;
    public KeyCode SprintKey = KeyCode.LeftShift;
    private float currentSpeed;

    [Header("Jump Settings")]
    [SerializeField] private float _jumpForce;
    [SerializeField] private float _gravityScale;
    [SerializeField] private float _fallGravity;
    [SerializeField] private Transform _groundCheck;
    [SerializeField] private float _groundCheckRadius;
    [SerializeField] private LayerMask _whatIsGround;
    public KeyCode JumpKey = KeyCode.Space;
    private bool isGrounded;


    private Rigidbody rb;
    Vector3 moveDirection;

    private float xInput;
    private float yInput;
    private bool canSprint;

    private void Awake()
    {
        rb = gameObject.GetComponent<Rigidbody>();
        rb.freezeRotation = true;
    }

    private void Update()
    {
        isGrounded = CheckIsGrounded();

        HandleInput();
        SpeedController();
        if (Input.GetKeyDown(KeyCode.Space))
            Jump();
    }

    private void FixedUpdate()
    {
        Move();
    }

    private void Move()
    {
        if (Input.GetKey(SprintKey))
            SprintController();

        // Add extra gravity
        rb.AddForce(Vector3.down * Time.deltaTime * Mathf.Abs(_fallGravity));

        Vector3 move = new Vector3(xInput, 0f, yInput);
        moveDirection = move;

        rb.AddForce(moveDirection.normalized * currentSpeed * 10f * Time.deltaTime, ForceMode.Force);
    }

    private void Jump()
    {
        if (isGrounded)
        {
            float initialVelocity = Mathf.Sqrt(-2f * _gravityScale * _jumpForce);
            rb.AddForce(Vector3.up * initialVelocity);
        }
    }

    private void SprintController()
    {
        canSprint = isGrounded ? true : false;
        currentSpeed = canSprint ? _sprintSpeed : _walkSpeed;
    }

    private void SpeedController()
    {
        Vector3 flatVector = VectorUtility.FlattenVector(rb.velocity);

        if (flatVector.magnitude > currentSpeed)
        {
            Vector3 limitedVector = flatVector.normalized * currentSpeed;
            rb.velocity = new Vector3(limitedVector.x, rb.velocity.y, limitedVector.z);
        }
    }

    private void HandleInput()
    {
        xInput = Input.GetAxisRaw("Horizontal");
        yInput = Input.GetAxisRaw("Vertical");
        currentSpeed = _walkSpeed;
    }

    private bool CheckIsGrounded()
    {
        Collider[] cols = Physics.OverlapSphere(_groundCheck.position, _groundCheckRadius, _whatIsGround);
        return cols.Length > 0;
    }
}