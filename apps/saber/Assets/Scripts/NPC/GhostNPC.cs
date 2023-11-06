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
        FadeInAndOut();
    }

    private void FadeInAndOut()
    {
        transparency = 0.5f + 0.3f * Mathf.Sin(Time.time);
        GetComponent<Renderer>().material.color = new Color(1, 1, 1, transparency);
    }

    public void Scare()
    {
        //TODO Implement scare behavior here
    }
}
