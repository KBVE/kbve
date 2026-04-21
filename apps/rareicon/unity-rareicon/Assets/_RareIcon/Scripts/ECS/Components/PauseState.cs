using Unity.Entities;

namespace RareIcon
{
    /// <summary>Singleton mirror of <see cref="PauseService"/>. Burst jobs read this to gate tick logic without touching managed code.</summary>
    public struct PauseState : IComponentData
    {
        public byte IsPaused;
        public byte TopReason;
    }
}
