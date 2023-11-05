using UnityEngine;

public class PlayerInteract : MonoBehaviour
{
    [Tooltip("The Transform representing the player's position.")]
    [SerializeField] Transform playerPos;

    [Tooltip("Maximum distance for object interaction")]
    [SerializeField] float interactionDistance = 3f;

    [Tooltip("Layer(s) for interactable objects")]
    [SerializeField] LayerMask interactableLayer;

    [Tooltip("Key for interaction")]
    [SerializeField] KeyCode interactionKey = KeyCode.E;

    [SerializeField] bool onDebug = true;

    private Ray ray; // Represents the interaction ray.
    private RaycastHit raycastHit; // Stores information about what the ray hits.
    void Update()
    {
        // Generate the interaction ray and display it for debugging.
        GenerateRay();
        DisplayRayOnDebug(onDebug);
    }

    void GenerateRay()
    {
        // Create a ray from the player's position in the direction they are facing.
        ray = new Ray(playerPos.transform.position, playerPos.transform.forward);

        // Check if the ray hits an interactable object within the specified distance and layer.
        if (Physics.Raycast(ray, out raycastHit, interactionDistance, interactableLayer))
        {
            Interactable interact = raycastHit.collider.GetComponent<Interactable>();

            // If an Interactable component is found and the interaction key is pressed, trigger interaction.
            if (interact != null)
            {
                if (Input.GetKeyDown(interactionKey))
                {
                    interact.BaseInteract(); // Call the interaction method on the Interactable component.
                }

                UpdateUIPromptMessage(interact.promptMsg);
            }
        }
    }

    void DisplayRayOnDebug(bool showRay)
    {
        // If debugging is enabled, draw a visible ray for debugging purposes.
        if (showRay)
            Debug.DrawRay(ray.origin, ray.direction * interactionDistance);
    }

    void UpdateUIPromptMessage(string promptMsg)
    {
        // TODO:
        // Update the UI with a prompt message.
    }
}
