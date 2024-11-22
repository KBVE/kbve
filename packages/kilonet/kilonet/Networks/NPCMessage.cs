using System;

namespace KBVE.Kilonet.Networks
{
    [Serializable]
    public class BaseNPC
    {
        public string NPCId { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
    }

    [Serializable]
    public class TraderNPC : BaseNPC
    {
        public string[] Inventory { get; set; }
    }

    [Serializable]
    public class MonsterNPC : BaseNPC
    {
        public int Health { get; set; }
        public int AttackPower { get; set; }
        public int Defense { get; set; }
    }

    [Serializable]
    public class BossNPC : MonsterNPC
    {
        public string[] BossMechanics { get; set; }
        public int DifficultyLevel { get; set; }
    }
}
