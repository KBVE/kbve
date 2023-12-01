using System.Collections;
using UnityEngine;

public class GhostNPC : NPC
{
  public float transparency;
  public float scareFactor;

  private GameObject playerObject; // Cached player object

  protected override void Start()
  {
    base.Start();
    transparency = 0.5f;
    scareFactor = 1.0f;
    base.InitializeTarget( GameObject.FindGameObjectWithTag("Player"));
    base.InitializeLifeCycle();

    //StartCoroutine(RoutineBehavior());
  }

  protected override void Update()
  {
    base.Update();
    // abilities.FadeInAndOut(GetComponent<Renderer>(), 0.5f + 0.3f * Mathf.Sin(Time.time));
    // abilities.Bobbing(transform);

    // if (playerObject != null)
    // {
    //   abilities.FollowTarget(playerObject.transform);
    // }
    // else
    // {
    //   Debug.LogWarning("No object with tag 'Player' found in the scene.", this);
    // }
  }
}

  // private IEnumerator RoutineBehavior()
  // {
  //   while (true)
  //   {
  //     if (playerObject != null)
  //     {
  //       TryCastingSpell();
  //     }
  //     else
  //     {
  //       // Try to find the player object again if it's null
  //       playerObject = GameObject.FindGameObjectWithTag("Player");
  //       if (playerObject == null)
  //       {
  //         Debug.LogWarning("Player object not found.", this);
  //       }
  //     }

  //     // Debug statement to ensure this coroutine is running
  //     //Debug.Log("RoutineBehavior running.");

  //     // Wait for 0.5 seconds (or any other appropriate interval) before the next iteration
  //     yield return new WaitForSeconds(0.5f);
  //   }
  // }

//   private void TryCastingSpell()
//   {
//     if (ShouldCastSpell(playerObject))
//     {
//       abilities.CastRandomSpell(playerObject);
//     }
//   }

//   public void Scare()
//   {
//     //TODO Implement scare behavior here - Migrating this over to the Abilities
//   }

//   private bool ShouldCastSpell(GameObject player)
//   {
//     // Placeholder for your spell casting logic
//     return Vector3.Distance(transform.position, player.transform.position) < 10f;
//   }

