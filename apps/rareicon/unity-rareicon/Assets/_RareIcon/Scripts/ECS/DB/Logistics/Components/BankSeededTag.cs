using Unity.Entities;

namespace RareIcon
{
    /// <summary>Marker added to a bank entity once its buffer contents have been seeded into LogisticsDBSingleton.CurrentAmounts. Ensures each bank is seeded exactly once — subsequent writes come exclusively from the resolve/commit pipeline, read back by the mirror.</summary>
    public struct BankSeededTag : IComponentData { }
}
