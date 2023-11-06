//*       [IMPORTS]
using UnityEngine;

//TODO    [!] - Abilities
//TODO    [SCARE] - Maybe a fear like ability?
//TODO    [CAST] - Spell casting for the NPC


public class NPCAbilities : MonoBehaviour
{

    public float bobbingSpeed = 0.5f;
    public float bobbingAmount = 0.5f;
    private float initialYPosition;
    private bool isInitialYPositionSet = false;

    public void Bobbing(Transform transform)
    {
        if (!isInitialYPositionSet)
        {
            initialYPosition = transform.position.y;
            isInitialYPositionSet = true;
        }

        float newYPosition = initialYPosition + Mathf.Sin(Time.time * bobbingSpeed) * bobbingAmount;
        transform.position = new Vector3(transform.position.x, newYPosition, transform.position.z);
    }

    public void FadeInAndOut(Renderer renderer, float transparency)
    {
        renderer.material.color = new Color(1, 1, 1, transparency);
    }


}
