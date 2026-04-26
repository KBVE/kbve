using Unity.Entities;

namespace RareIcon
{
    public enum BankKindId : byte
    {
        Capital    = 0,
        Furnace    = 1,
        Farm       = 2,
        Barracks   = 3,
        GoblinCave = 4,
        Lumbercamp = 5,
        MiningPit  = 6,
    }

    public struct BankKind : IComponentData
    {
        public byte Value;
    }
}
