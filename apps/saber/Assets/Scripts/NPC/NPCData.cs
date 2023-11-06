using UnityEngine;

[CreateAssetMenu(fileName = "New NPC Data", menuName = "NPC Data", order = 51)]
public class NPCData : ScriptableObject
{
    public string npcName;
    public int maxHealth;
    public float speed;
    public int attackPower;
    public int defensePower;
}
