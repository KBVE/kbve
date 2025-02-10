//*       [IMPORTS]
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

//TODO    [!] - Abilities
//TODO    [SCARE] - Maybe a fear like ability?
//TODO    [CAST] - Spell casting for the NPC


public class NPCAbilities : MonoBehaviour
{
  private Entity _ownerEntity;

  public Entity OwnerEntity
  {
    get { return _ownerEntity; }
    set { _ownerEntity = value; }
  }


  // Bobbing Variables
  public float bobbingSpeed = 0.5f;
  public float bobbingAmount = 0.5f;
  private float initialYPosition;
  private bool isInitialYPositionSet = false;

  // Assuming there's a mana system in place
  public float currentMana;
  public float maxMana;
  public SpellPool spellPool; // Assign this in the inspector

  //;public Spell spell;

  //[SerializeField] private List<Spell> spellPool = new List<Spell>();
  private Dictionary<Spell, float> spellCooldowns = new Dictionary<Spell, float>();
  private Camera mainCamera;

  // Entity Following
  public float followDistance = 1.0f; // The distance the NPC will keep from the target
  public float followSpeed = 5.0f; // Speed at which the NPC will follow the target

  private void Start()
  {
    // Cache the main camera on start
    mainCamera = Camera.main;
    InitializeCooldowns();
    //LinkStats();
  }

  private void Update()
  {
    UpdateCooldowns();
  }




  private void InitializeCooldowns()
  {
    if (spellPool == null)
    {
      Debug.LogError("Spell pool has not been assigned.");
      return;
    }

    if (spellCooldowns == null)
    {
      spellCooldowns = new Dictionary<Spell, float>();
    }
    else
    {
      spellCooldowns.Clear();
    }

    foreach (Spell spell in spellPool.spells)
    {
      if (spell != null)
      {
        spellCooldowns.Add(spell, 0f);
      }
      else
      {
        Debug.LogWarning("A spell within the spell pool is null.");
      }
    }
  }

  // Updates the cooldowns over time
  private void UpdateCooldowns()
  {
    // Ensure that spellCooldowns is not null
    if (spellCooldowns == null)
    {
      Debug.LogError("spellCooldowns dictionary has not been initialized!");
      return;
    }

    // Create a list to avoid modifying the dictionary while iterating through it
    List<Spell> spellsToUpdate = new List<Spell>(spellCooldowns.Keys);

    foreach (Spell spell in spellsToUpdate)
    {
      // Safeguard against a potential missing key
      if (spellCooldowns.ContainsKey(spell) && spellCooldowns[spell] > 0f)
      {
        spellCooldowns[spell] -= Time.deltaTime;
        if (spellCooldowns[spell] < 0f)
        {
          spellCooldowns[spell] = 0f;
        }
      }
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

  public void FollowTarget(Transform target)
  {
    Vector3 directionToTarget = (target.position - transform.position).normalized;
    Vector3 desiredPosition = target.position - directionToTarget * followDistance;

    // Ensure the NPC only moves along the x and z axes (assuming y is up/down)
    desiredPosition.y = transform.position.y;

    // Smoothly interpolate to the desired position
    transform.position = Vector3.MoveTowards(
      transform.position,
      desiredPosition,
      followSpeed * Time.deltaTime
    );
  }

  public void CastRandomSpell(GameObject target)
  {
    // Ensure the spell pool and cooldown dictionary are initialized
    if (spellPool == null || spellCooldowns == null)
    {
      Debug.LogError("Spell pool or cooldowns dictionary has not been initialized.");
      return;
    }

    // Shuffle the list of spells to add randomness to which spell gets cast first
    List<Spell> shuffledSpells = spellPool.spells.OrderBy(a => Random.value).ToList();

    foreach (Spell spell in shuffledSpells)
    {
      if (currentMana >= spell.manaCost && spellCooldowns[spell] <= 0)
      {
        // Cast the first spell in the shuffled list that is not on cooldown and the NPC has mana for
        StartCoroutine(PerformSpellCast(spell, target));
        return; // Exit the method after casting to avoid casting multiple spells at once
      }
    }
    //! [DEV] - Uncomment this line below if you need help to debug the spell errors.
    //  Debug.Log("No spells are available to cast.");
  }

  public void CastSpell(string spellName, GameObject target)
  {
    Spell spellToCast = spellPool.GetSpellByName(spellName);
    if (spellToCast == null)
    {
      Debug.LogError($"Spell {spellName} does not exist in the spell pool.");
      return;
    }

    if (currentMana < spellToCast.manaCost)
    {
      Debug.LogWarning(
        $"Not enough mana to cast spell {spellName}. Current mana: {currentMana}, required: {spellToCast.manaCost}"
      );
      return;
    }

    if (spellCooldowns[spellToCast] > 0)
    {
      Debug.LogWarning(
        $"Spell {spellName} is on cooldown. Time left: {spellCooldowns[spellToCast]} seconds"
      );
      return;
    }

    if (
      spellToCast != null
      && currentMana >= spellToCast.manaCost
      && spellCooldowns[spellToCast] <= 0
    )
    {
      // Start the PerformSpellCast coroutine
      StartCoroutine(PerformSpellCast(spellToCast, target));
    }
  }

  private IEnumerator PerformSpellCast(Spell spell, GameObject target)
  {
    currentMana -= spell.manaCost; // Deduct mana cost
    spellCooldowns[spell] = spell.cooldown; // Set the cooldown

    //TODO trigger casting animations or effects here

    // Wait for the cast time before the spell takes effect
    yield return new WaitForSeconds(spell.castTime);

    spell.Cast(this.gameObject, target, mainCamera); // Cast the spell
  }
}
