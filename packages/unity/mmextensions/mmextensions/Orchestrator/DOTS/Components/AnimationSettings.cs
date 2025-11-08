using Unity.Entities;

namespace NSprites
{
    public struct AnimationSettings : IComponentData
    {
        public int IdleHash;
        public int WalkHash;
        public int AttackHash;
        public int DeathHash;
        public int HurtHash;

    }
}