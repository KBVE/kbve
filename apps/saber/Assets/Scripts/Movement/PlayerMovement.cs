using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
  [Header("Settings")]
  [SerializeField] float walkSpeed = 5f;
  [SerializeField] float runSpeed = 8f;

  [Header("References")]
  Rigidbody rb;

  [Header("Private Vars")]
  Vector3 moveDir;
  float moveSpeed;
  float horiz;
  float vert;

  void Awake()
  {
    rb = GetComponent<Rigidbody>();
  }

  // Update is called once per frame
  void Update()
  {
    GetInput();
    SpeedControl();
  }

  void FixedUpdate()
  {
    MovePlayer();
  }

  void MovePlayer()
  {
    Vector3 inputDir = new Vector3(horiz, 0, vert);
    moveDir = inputDir;
    rb.AddForce(moveDir.normalized * moveSpeed * 10f, ForceMode.Force);
  }
  void SpeedControl()
  {

    Vector3 flatVel = VectorUtility.FlattenVector(rb.velocity);

    if (flatVel.magnitude > moveSpeed)
    {
      Vector3 limitedVel = flatVel.normalized * moveSpeed;
      rb.velocity = new Vector3(limitedVel.x, rb.velocity.y, limitedVel.z);
    }
  }

  void GetInput()
  {
    horiz = Input.GetAxis("Horizontal");
    vert = Input.GetAxis("Vertical");
    moveSpeed = walkSpeed;
  }
}
