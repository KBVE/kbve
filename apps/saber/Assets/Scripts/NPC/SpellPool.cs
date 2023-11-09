using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "New Spell Pool", menuName = "Abilities/Spell Pool")]
public class SpellPool : ScriptableObject
{
    public List<Spell> spells = new List<Spell>();

    public void AddSpell(Spell spell)
    {
        if (!spells.Contains(spell))
        {
            spells.Add(spell);
        }
    }

    public bool RemoveSpell(Spell spell)
    {
        return spells.Remove(spell);
    }

    public Spell GetSpellByName(string name)
    {
        return spells.Find(spell => spell.spellName == name);
    }

}
