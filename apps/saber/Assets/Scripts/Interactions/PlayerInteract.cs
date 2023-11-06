using UnityEngine;

public class PlayerInteract : MonoBehaviour
{
    [Tooltip("The transform representing the position for sphere-based interaction checks.")]
    [SerializeField] Transform sphereCheck;

    [Tooltip("Maximum distance for object interaction")]
    [SerializeField] float interactionDistance = 9f;

    [Tooltip("Layer(s) for interactable objects")]
    [SerializeField] LayerMask interactableLayer;

    [Tooltip("Key for interaction")]
    [SerializeField] KeyCode interactionKey = KeyCode.E;

    [Space(5)]
    // Debug options
    [SerializeField] bool onDebug = true;
    [SerializeField] Color sphereDebugColor = Color.blue;

    private Ray ray; // Represents the interaction ray.
    private RaycastHit raycastHit; // Stores information about what the ray hits.

    void Awake()
    {
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }
    void Update()
    {
        // Generate the interaction ray and display it for debugging.
        CheckInteractableHits();
    }

    void CheckInteractableHits()
    {
        // Check if the sphere intersects with any objects on the specified layer within the interaction distance.
        bool foundObj = Physics.CheckSphere(sphereCheck.position, interactionDistance, interactableLayer);


        if (foundObj)
        {
            // Get all colliders that are within the specified sphere.
            Collider[] cols = Physics.OverlapSphere(sphereCheck.position, interactionDistance, interactableLayer);

            // Iterate through the colliders found within the sphere.
            foreach (var col in cols)
            {
                // Check if the collider has an Interactable component.
                Interactable interactable = col.GetComponent<Interactable>();

                if (interactable != null)
                {
                    // Check if the interaction key is pressed and trigger the interaction.
                    if (Input.GetKeyDown(interactionKey))
                    {
                        interactable.BaseInteract();
                    }

                    // Update the UI prompt message for the interactable object.
                    UpdateUIPromptMessage(interactable.promptMsg);
                }
            }
        }
    }

    void OnDrawGizmosSelected()
    {
        if (onDebug)
        {
            // Draw a sphere at the decided position to visualize the interaction distance.
            Gizmos.color = sphereDebugColor;
            Gizmos.DrawWireSphere(sphereCheck.position, interactionDistance);
        }
    }

    void UpdateUIPromptMessage(string promptMsg)
    {
        // TODO:
        // Update the UI with a prompt message.
    }
}
