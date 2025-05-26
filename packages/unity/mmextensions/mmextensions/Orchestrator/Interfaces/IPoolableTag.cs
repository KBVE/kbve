using KBVE.MMExtensions.Orchestrator.Core;

namespace KBVE.MMExtensions.Orchestrator.Interfaces
{
    public interface IPoolableTag
    {
        PoolableType Type { get; set; }
    }
}