using UnityEngine;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Orchestrator.Interfaces
{
    public interface IAddressablePrefabLoader
    {
        UniTask<GameObject> LoadPrefabAsync(string key);
    }
}