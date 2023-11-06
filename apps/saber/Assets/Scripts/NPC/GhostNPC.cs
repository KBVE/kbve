using UnityEngine;

public class GhostNPC : NPC
{
    public float transparency;
    public float scareFactor;

    protected override void Start()
    {
        base.Start();
        transparency = 0.5f;
        scareFactor = 1.0f;
    }

    protected override void Update()
    {
        base.Update();
        abilities.FadeInAndOut(GetComponent<Renderer>(), 0.5f + 0.3f * Mathf.Sin(Time.time));
        abilities.Bobbing(transform);

    }

    public void Scare()
    {
        //TODO Implement scare behavior here - Migrating this over to the Abilities
    }
}
