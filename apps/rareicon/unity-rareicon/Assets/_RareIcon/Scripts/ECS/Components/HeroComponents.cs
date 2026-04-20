using Unity.Entities;

namespace RareIcon
{
    public static class HeroRole
    {
        public const byte None             = 0;
        public const byte MasterBlacksmith = 1;
        public const byte MasterCraftsman  = 2;
    }

    public struct HeroTag : IComponentData
    {
        public byte Role;
    }
}
