using System;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    [Flags]
    public enum PoolableType
    {
        None        = 0,
        Enemy       = 1 << 0,  // 1
        Structure   = 1 << 1,  // 2
        Effect      = 1 << 2,  // 4
        Ally        = 1 << 3   // 8
    }
}