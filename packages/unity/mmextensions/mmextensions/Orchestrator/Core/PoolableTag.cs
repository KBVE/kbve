using UnityEngine;
using KBVE.MMExtensions.Orchestrator.Interfaces;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class PoolableTag : MonoBehaviour, IPoolableTag
    {
        [SerializeField]
        private PoolableType type = PoolableType.None;

        public PoolableType Type => type;
    }
}