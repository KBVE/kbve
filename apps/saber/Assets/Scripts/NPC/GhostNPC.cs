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

               //! Adding the Player to the Target of the Abilities
        GameObject playerObject = GameObject.FindGameObjectWithTag("Player");
        if (playerObject != null)
        {
          abilities.FollowTarget(playerObject.transform);

          if (ShouldCastSpell(playerObject))
            {
                //abilities.CastSpell("WindCast", playerObject); // Cast the spell
                abilities.CastRandomSpell(playerObject);
            }
        }
        else
        {
            Debug.LogWarning("No object with tag 'Player' found in the scene.", this);
        }

    }

    public void Scare()
    {
        //TODO Implement scare behavior here - Migrating this over to the Abilities
    }


    private bool ShouldCastSpell(GameObject player)
    {
        // Placeholder for your spell casting logic
        return Vector3.Distance(transform.position, player.transform.position) < 10f;
    }

}
