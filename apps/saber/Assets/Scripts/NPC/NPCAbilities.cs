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


    public Transform target; // The target that the NPC will follow
    public float followDistance = 1.0f; // The distance the NPC will keep from the target
    public float followSpeed = 5.0f; // Speed at which the NPC will follow the target


    private void Update()
    {
        if (target != null) // Only follow if there is a target assigned
        {
            FollowTarget();
        }
    }

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

    private void FollowTarget()
    {
        Vector3 directionToTarget = (target.position - transform.position).normalized;
        Vector3 desiredPosition = target.position - directionToTarget * followDistance;

        // Ensure the NPC only moves along the x and z axes (assuming y is up/down)
        desiredPosition.y = transform.position.y;

        // Smoothly interpolate to the desired position
        transform.position = Vector3.MoveTowards(transform.position, desiredPosition, followSpeed * Time.deltaTime);
    }



}
