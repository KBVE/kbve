using UnityEngine;

public class PlayerInteract : MonoBehaviour
{
    [Header("Interaction Settings")]

    [Tooltip("Maximum distance for object interaction")]
    [SerializeField] float interactionDistance = 9f;

    [Tooltip("The maximum angle (in degrees) within which the player must be facing an interactable object to trigger interaction.")]
    [SerializeField] float maxInteractionAngle = 80f;


    [Tooltip("Layer(s) for interactable objects")]
    [SerializeField] LayerMask interactableLayer;

    [Tooltip("Key for interaction")]
    [SerializeField] KeyCode interactionKey = KeyCode.E;


    [Space(5)]
    // Debug options
    [SerializeField] bool onDebug = true;
    [SerializeField] Color rayColor = Color.blue;

    private Ray ray; // Represents the interaction ray.
    private RaycastHit raycastHit; // Stores information about what the ray hits.

    void Awake()
    {
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }
    void Update()
    {
        CreateInteractionRay();
    }

    void CreateInteractionRay()
    {
        ray = Camera.main.ScreenPointToRay(Input.mousePosition);

        // check if a raycast hits an object within the specified interaction distance and on the interactable layer
        if (Physics.Raycast(ray, out raycastHit, interactionDistance, interactableLayer))
        {

            // get the interactable component of the object hit by the ray
            Interactable interactable = raycastHit.collider.GetComponent<Interactable>();

            if (interactable != null)
            {

                // Calculate the direction to the interactable object
                Vector3 dirToInteractObj = raycastHit.transform.position - transform.position;
                float angle = Vector3.Angle(transform.forward, dirToInteractObj);


                // Check if the angle is within the acceptable range (maxInteractionAngle) to ensure the player is facing the object
                if (angle < maxInteractionAngle)
                {
                    // Check if the interaction key is pressed and trigger the interaction
                    if (Input.GetKeyDown(interactionKey))
                    {
                        interactable.BaseInteract();
                    }

                    // Update the UI prompt message for the interactable object
                    UpdateUIPromptMessage(interactable.promptMsg);
                }
            }
        }
    }

    void OnDrawGizmosSelected()
    {
        if (onDebug)
        {
            // Draw a ray in the direction of the player's forward vector.
            Gizmos.color = rayColor;
            Gizmos.DrawRay(transform.position, transform.forward * interactionDistance);
        }
    }

    void UpdateUIPromptMessage(string promptMsg)
    {
        // TODO:
        // Update the UI with a prompt message.
    }
}
