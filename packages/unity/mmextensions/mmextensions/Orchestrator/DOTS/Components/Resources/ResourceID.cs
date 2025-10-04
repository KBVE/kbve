using Unity.Entities;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct ResourceID : IComponentData
    {
        public FixedBytes16 ulid;
        //public FixedString64Bytes ulid;
        // public FixedString128Bytes guid;
    }
}