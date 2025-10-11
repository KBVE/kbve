using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct MoveTimer : IComponentData
    {
        public float RemainingTime;
    }
}