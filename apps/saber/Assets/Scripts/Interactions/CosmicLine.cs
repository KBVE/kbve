using System.Collections;
using UnityEngine;

public class CosmicLine : Interactable
{
    bool canInteract = true;
    private float interactionCooldown = 0.5f;

    protected override void Interact()
    {
        if (canInteract)
        {
            canInteract = false;
            this.gameObject.GetComponentInParent<LineRenderer>().enabled = false;
            KeyTower.activeCosmicLines--;
            Debug.Log(KeyTower.activeCosmicLines);
            StartCoroutine(InteractionCooldown());
        }
    }

    IEnumerator InteractionCooldown()
    {
        yield return new WaitForSeconds(interactionCooldown);
        canInteract = true;
    }
}