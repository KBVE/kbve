using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public abstract class Interactable : MonoBehaviour
{
    // Message that will be displayed when Player looking at an Interactable object
    public string promptMsg;

    // This function will be called from Player
    public void BaseInteract()
    {
        this.Interact();
    }

    protected virtual void Interact()
    {
        // This is a template to be overridden by subclasses
    }
}
