using System;

namespace KBVE.Kilonet.Networks
{
    [Serializable]
    public class GameStateMessage
    {
        public PlayerState[] Players { get; set; }
        public NPCState[] NPCs { get; set; }
    }

    [Serializable]
    public class PlayerState
    {
        public string PlayerId { get; set; }
        public float PositionX { get; set; }
        public float PositionY { get; set; }
        public float PositionZ { get; set; }
        public string AnimationState { get; set; }
    }

    [Serializable]
    public class NPCState
    {
        public string NPCId { get; set; }
        public float PositionX { get; set; }
        public float PositionY { get; set; }
        public float PositionZ { get; set; }
        public string AIState { get; set; }
    }
}
