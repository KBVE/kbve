using UnityEngine;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Orchestrator.Interfaces
{
    public interface IPrefabOrchestrator
    {
        UniTask<GameObject> Spawn(string key, Vector3 position, Quaternion rotation);
        void Despawn(string key, GameObject instance);
    }
}
